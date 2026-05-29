mod commands;
mod mcp;
mod tray;
mod hotkeys;
mod notifications;

use tauri::Manager;
use mcp::{McpSystemState, ActiveServer, JsonRpcRequest, JsonRpcResponse, McpTool};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use std::process::Stdio;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, shortcut, _event| {
            hotkeys::on_hotkey_pressed(app, shortcut);
        }).build())
        .manage(McpSystemState::default())
        .setup(|app| {
            let app_handle = app.handle().clone();

            let app_data_dir = app.path().app_data_dir()
                .map_err(|err| Box::<dyn std::error::Error>::from(err.to_string()))?;

            jarvis_core::db::init(&app_data_dir)
                .map_err(|err| Box::<dyn std::error::Error>::from(err.to_string()))?;

            tray::create_tray(&app_handle)
                .map_err(|err| Box::<dyn std::error::Error>::from(err.to_string()))?;

            hotkeys::register_hotkeys(&app_handle)
                .map_err(|err| Box::<dyn std::error::Error>::from(err.to_string()))?;

            notifications::notify_info(&app_handle, "JARVIS AI", "Application started successfully");

            // Auto-restore persisted MCP server configs
            if let Ok(configs) = mcp::load_server_configs(&app_handle) {
                for cfg in configs {
                    if cfg.cmd.is_empty() {
                        continue;
                    }
                    let handle = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = auto_spawn_and_register(&handle, &cfg.name, &cfg.cmd, &cfg.args).await {
                            eprintln!("[MCP] Failed to auto-restore '{}': {}", cfg.name, e);
                        }
                    });
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::save_conversation,
            commands::save_message,
            commands::list_conversations,
            commands::list_messages,
            commands::delete_conversation,
            commands::hard_delete_session,
            commands::delete_chat,
            commands::wipe_incognito_session,
            commands::stream_chat,
            commands::cancel_chat_stream,
            commands::list_provider_models,
            commands::check_provider_health,
            commands::save_app_settings,
            commands::load_app_settings,
            commands::run_jarvis_task,
            commands::wipe_all_data,
            commands::list_available_themes,
            mcp::mcp_spawn_and_initialize,
            mcp::mcp_get_active_tools,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| {
        if let tauri::RunEvent::Exit = event {
        }
    });
}

async fn auto_spawn_and_register(
    app: &tauri::AppHandle,
    name: &str,
    cmd: &str,
    args: &[String],
) -> Result<(), String> {
    let mut child = tokio::process::Command::new(cmd)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Process spawning failure: {}", e))?;

    let mut stdin = child.stdin.take().ok_or("Failed to seize stdin handle")?;
    let stdout = child.stdout.take().ok_or("Failed to seize stdout handle")?;

    let init_req = JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        method: "initialize".to_string(),
        id: 1,
        params: serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": { "name": "JARVIS-Desktop", "version": "1.0.0" }
        }),
    };

    let raw_payload = serde_json::to_string(&init_req).unwrap() + "\n";
    stdin.write_all(raw_payload.as_bytes()).await.map_err(|e| e.to_string())?;
    stdin.flush().await.map_err(|e| e.to_string())?;

    let mut reader = BufReader::new(stdout).lines();
    let mut discovered_tools = Vec::new();

    if let Some(line) = reader.next_line().await.map_err(|e| e.to_string())? {
        let res: JsonRpcResponse = serde_json::from_str(&line)
            .map_err(|e| format!("Handshake parse error: {} | Content: {}", e, line))?;

        if let Some(_error) = res.error {
            return Err(format!("Auto-restore handshake rejected: {:?}", _error));
        }

        let list_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: "tools/list".to_string(),
            id: 2,
            params: serde_json::json!({}),
        };

        let list_payload = serde_json::to_string(&list_req).unwrap() + "\n";
        stdin.write_all(list_payload.as_bytes()).await.map_err(|e| e.to_string())?;
        stdin.flush().await.map_err(|e| e.to_string())?;

        if let Some(list_line) = reader.next_line().await.map_err(|e| e.to_string())? {
            let list_res: JsonRpcResponse = serde_json::from_str(&list_line)
                .map_err(|e| format!("Tools parse error: {}", e))?;

            if let Some(result) = list_res.result {
                if let Some(tools_array) = result.get("tools") {
                    discovered_tools = serde_json::from_value::<Vec<McpTool>>(tools_array.clone())
                        .map_err(|e| format!("Schema mapping failure: {}", e))?;
                }
            }
        }
    }

    let (stdin_tx, mut stdin_rx) = tokio::sync::mpsc::channel::<String>(32);
    tokio::spawn(async move {
        while let Some(msg) = stdin_rx.recv().await {
            let _ = stdin.write_all((msg + "\n").as_bytes()).await;
            let _ = stdin.flush().await;
        }
    });

    let state = app.state::<McpSystemState>();
    let mut active_map = state.servers.lock().await;
    active_map.insert(name.to_string(), ActiveServer {
        process: child,
        stdin_tx,
        tools: discovered_tools,
    });

    eprintln!("[MCP] Auto-restored server: {}", name);
    Ok(())
}
