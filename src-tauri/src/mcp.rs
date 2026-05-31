use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Child;
use tokio::sync::Mutex;
use tokio::sync::mpsc;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct McpToolProperty {
    pub r#type: String,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct McpToolSchema {
    pub r#type: String,
    pub properties: HashMap<String, McpToolProperty>,
    pub required: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct McpTool {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: McpToolSchema,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    pub params: serde_json::Value,
    pub id: u64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: u64,
    pub result: Option<serde_json::Value>,
    pub error: Option<serde_json::Value>,
}

#[allow(dead_code)]
pub struct ActiveServer {
    pub process: Child,
    pub stdin_tx: mpsc::Sender<String>,
    pub tools: Vec<McpTool>,
}

#[derive(Default)]
pub struct McpSystemState {
    pub servers: Arc<Mutex<HashMap<String, ActiveServer>>>,
}

#[tauri::command]
pub async fn mcp_spawn_and_initialize(
    app_handle: AppHandle,
    name: String,
    cmd: String,
    args: Vec<String>,
) -> Result<Vec<McpTool>, String> {
    println!("📡 [MCP Backend] Initializing node process: {} via {} {:?}", name, cmd, args);

    let state = app_handle.state::<McpSystemState>();

    let mut child = tokio::process::Command::new(&cmd)
        .args(&args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Process spawning initiation failure: {}", e))?;

    let mut stdin = child.stdin.take().ok_or("Failed to seize child stdin channel handle")?;
    let stdout = child.stdout.take().ok_or("Failed to seize child stdout channel handle")?;

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
            .map_err(|e| format!("Handshake frame parsing error: {} | Content: {}", e, line))?;

        if let Some(error) = res.error {
            return Err(format!("Host node rejected protocol configuration: {:?}", error));
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
                .map_err(|e| format!("Tools response frame breakdown error: {}", e))?;

            if let Some(result) = list_res.result {
                if let Some(tools_array) = result.get("tools") {
                    discovered_tools = serde_json::from_value::<Vec<McpTool>>(tools_array.clone())
                        .map_err(|e| format!("Schema composition mapping failure: {}", e))?;
                }
            }
        }
    }

    let (stdin_tx, mut stdin_rx) = mpsc::channel::<String>(32);
    tokio::spawn(async move {
        while let Some(msg) = stdin_rx.recv().await {
            let _ = stdin.write_all((msg + "\n").as_bytes()).await;
            let _ = stdin.flush().await;
        }
    });

    let server_name = name.clone();
    let mut active_map = state.servers.lock().await;
    active_map.insert(name, ActiveServer {
        process: child,
        stdin_tx,
        tools: discovered_tools.clone(),
    });

    // Persist to disk
    let mut persisted = load_persisted_servers(&app_handle).unwrap_or_default();
    if let Some(pos) = persisted.iter().position(|s| s.name == server_name) {
        persisted[pos] = PersistedServer {
            name: server_name.clone(),
            cmd: cmd.clone(),
            args: args.clone(),
        };
    } else {
        persisted.push(PersistedServer {
            name: server_name.clone(),
            cmd: cmd.clone(),
            args: args.clone(),
        });
    }
    let _ = save_persisted_servers(&app_handle, &persisted);

    Ok(discovered_tools)
}

#[tauri::command]
pub async fn mcp_get_active_tools(
    state: State<'_, McpSystemState>,
) -> Result<HashMap<String, Vec<McpTool>>, String> {
    let active_map = state.servers.lock().await;
    let mut summary = HashMap::new();
    for (k, v) in active_map.iter() {
        summary.insert(k.clone(), v.tools.clone());
    }
    Ok(summary)
}

#[tauri::command]
pub async fn mcp_disconnect_server(
    app_handle: AppHandle,
    name: String,
) -> Result<(), String> {
    println!("🔌 [Tauri Backend] Request to disconnect and terminate node: {}", name);

    let state = app_handle.state::<McpSystemState>();
    let mut active_map = state.servers.lock().await;

    if let Some(mut server) = active_map.remove(&name) {
        match server.process.kill().await {
            Ok(_) => {
                println!("✅ [Tauri Backend] Successfully terminated background process for: {}", name);

                // Remove from persisted config
                let mut persisted = load_persisted_servers(&app_handle).unwrap_or_default();
                persisted.retain(|s| s.name != name);
                let _ = save_persisted_servers(&app_handle, &persisted);

                Ok(())
            }
            Err(e) => {
                Err(format!("Server record dropped, but process termination failed: {}", e))
            }
        }
    } else {
        Err(format!("No active protocol node found with identifier: {}", name))
    }
}

#[tauri::command]
pub async fn mcp_hydrate_saved_servers(
    app_handle: AppHandle,
) -> Result<(), String> {
    let persisted = load_persisted_servers(&app_handle)?;
    println!("🔄 [Tauri Backend] Dehydrating {} saved MCP server node profiles...", persisted.len());

    for server in persisted {
        let handle = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = mcp_spawn_and_initialize(
                handle.clone(),
                server.name,
                server.cmd,
                server.args,
            ).await {
                eprintln!("[MCP] Hydration failed for saved server: {}", e);
            }
        });
    }

    Ok(())
}

// ─── Multi-Server Registration & Persistence ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedServer {
    pub name: String,
    pub cmd: String,
    pub args: Vec<String>,
}

pub fn get_mcp_config_path(app_handle: &AppHandle) -> std::path::PathBuf {
    app_handle.path()
        .app_config_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("mcp_config.dat")
}

#[allow(dead_code)]
fn save_persisted_servers(app: &AppHandle, configs: &[PersistedServer]) -> Result<(), String> {
    let path = get_mcp_config_path(app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(configs).map_err(|e| e.to_string())?;
    std::fs::write(&path, &json).map_err(|e| e.to_string())
}

pub fn load_persisted_servers(app: &AppHandle) -> Result<Vec<PersistedServer>, String> {
    let path = get_mcp_config_path(app);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}
