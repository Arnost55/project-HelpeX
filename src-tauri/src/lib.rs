mod commands;
mod mcp;
mod tray;
mod hotkeys;
mod notifications;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, shortcut, _event| {
            hotkeys::on_hotkey_pressed(app, shortcut);
        }).build())
        .manage(mcp::McpState {
            client: tokio::sync::Mutex::new(None),
        })
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
                    let handle = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if cfg.cmd.is_empty() {
                            return;
                        }
                        match mcp::McpClient::spawn_server(&cfg.cmd, &cfg.args).await {
                            Ok(mut client) => {
                                if let Ok(info) = client.initialize_handshake().await {
                                    let state = handle.state::<mcp::McpState>();
                                    let mut guard = state.client.lock().await;
                                    *guard = Some(client);
                                    eprintln!("[MCP] Auto-restored server: {}", cfg.name);
                                    let _ = info;
                                }
                            }
                            Err(e) => {
                                eprintln!("[MCP] Failed to auto-restore '{}': {}", cfg.name, e);
                            }
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
            mcp::mcp_connect,
            mcp::mcp_get_tools,
            mcp::mcp_call_tool,
            mcp::mcp_add_and_spawn_server,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| {
        if let tauri::RunEvent::Exit = event {
        }
    });
}
