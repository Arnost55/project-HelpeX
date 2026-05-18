use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};
use tokio::process::Command;

pub struct McpClient {
    _child: tokio::process::Child,
    stdin: BufWriter<tokio::process::ChildStdin>,
    stdout: BufReader<tokio::process::ChildStdout>,
    request_id: AtomicU64,
}

impl McpClient {
    pub async fn spawn_server(command: &str, args: &[String]) -> Result<Self, String> {
        let mut child = Command::new(command)
            .args(args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| {
                format!(
                    "Failed to spawn MCP server '{}': {}. Is it installed?",
                    command, e
                )
            })?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to capture MCP server stdin".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture MCP server stdout".to_string())?;

        Ok(McpClient {
            _child: child,
            stdin: BufWriter::new(stdin),
            stdout: BufReader::new(stdout),
            request_id: AtomicU64::new(1),
        })
    }

    pub async fn initialize_handshake(&mut self) -> Result<Value, String> {
        let result = self
            .send_request(
                "initialize",
                Some(serde_json::json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {
                        "name": "jarvis-ai",
                        "version": "0.1.0"
                    }
                })),
            )
            .await?;

        self.send_notification("notifications/initialized", None)
            .await?;

        Ok(result)
    }

    pub async fn list_tools(&mut self) -> Result<Value, String> {
        self.send_request("tools/list", None).await
    }

    pub async fn call_tool(&mut self, name: &str, arguments: Value) -> Result<Value, String> {
        self.send_request(
            "tools/call",
            Some(serde_json::json!({ "name": name, "arguments": arguments })),
        )
        .await
    }

    async fn send_request(&mut self, method: &str, params: Option<Value>) -> Result<Value, String> {
        let id = self.request_id.fetch_add(1, Ordering::SeqCst);

        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params.unwrap_or(serde_json::json!({})),
        });

        self.write_line(&serde_json::to_string(&request).map_err(|e| e.to_string())?)
            .await?;

        let response_line = self.read_line().await?;

        let response: Value = serde_json::from_str(&response_line)
            .map_err(|e| format!("Failed to parse MCP response: {} (raw: {})", e, response_line))?;

        if let Some(error) = response.get("error") {
            let msg = error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("unknown mcp error");
            return Err(format!("MCP server error: {}", msg));
        }

        Ok(response.get("result").cloned().unwrap_or(Value::Null))
    }

    async fn send_notification(&mut self, method: &str, params: Option<Value>) -> Result<(), String> {
        let notification = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params.unwrap_or(serde_json::json!({})),
        });

        self.write_line(&serde_json::to_string(&notification).map_err(|e| e.to_string())?)
            .await
    }

    async fn write_line(&mut self, line: &str) -> Result<(), String> {
        let mut payload = line.to_string();
        payload.push('\n');
        self.stdin
            .write_all(payload.as_bytes())
            .await
            .map_err(|e| format!("Failed to write to MCP stdin: {}", e))?;
        self.stdin
            .flush()
            .await
            .map_err(|e| format!("Failed to flush MCP stdin: {}", e))
    }

    async fn read_line(&mut self) -> Result<String, String> {
        let mut line = String::new();
        self.stdout
            .read_line(&mut line)
            .await
            .map_err(|e| format!("Failed to read from MCP stdout: {}", e))?;
        let trimmed = line.trim().to_string();
        if trimmed.is_empty() {
            return Err("MCP server closed the connection".to_string());
        }
        Ok(trimmed)
    }
}

pub struct McpState {
    pub client: tokio::sync::Mutex<Option<McpClient>>,
}

#[tauri::command]
pub async fn mcp_connect(
    state: State<'_, McpState>,
    command: String,
    args: Vec<String>,
) -> Result<String, String> {
    let mut client = McpClient::spawn_server(&command, &args).await?;
    let _server_info = client.initialize_handshake().await?;

    let mut guard = state.client.lock().await;
    *guard = Some(client);

    eprintln!("[MCP] Connected: {} {:?}", command, args);
    Ok("connected".to_string())
}

#[tauri::command]
pub async fn mcp_get_tools(state: State<'_, McpState>) -> Result<Value, String> {
    let mut guard = state.client.lock().await;
    let client = guard
        .as_mut()
        .ok_or_else(|| "MCP server is not connected".to_string())?;
    client.list_tools().await
}

#[tauri::command]
pub async fn mcp_call_tool(
    state: State<'_, McpState>,
    name: String,
    arguments: Value,
) -> Result<Value, String> {
    let mut guard = state.client.lock().await;
    let client = guard
        .as_mut()
        .ok_or_else(|| "MCP server is not connected".to_string())?;
    client.call_tool(&name, arguments).await
}

// ─── Multi-Server Registration & Persistence ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub name: String,
    pub cmd: String,
    pub args: Vec<String>,
}

fn config_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_data.join("mcp-servers.json"))
}

pub fn save_server_configs(app: &AppHandle, configs: &[McpServerConfig]) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(configs).map_err(|e| e.to_string())?;
    std::fs::write(&path, &json).map_err(|e| e.to_string())
}

pub fn load_server_configs(app: &AppHandle) -> Result<Vec<McpServerConfig>, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mcp_add_and_spawn_server(
    state: State<'_, McpState>,
    app: AppHandle,
    name: String,
    cmd: String,
    args: Vec<String>,
) -> Result<String, String> {
    let mut client = McpClient::spawn_server(&cmd, &args).await?;
    let server_info = client.initialize_handshake().await?;

    let mut guard = state.client.lock().await;
    *guard = Some(client);

    let label = server_info
        .get("serverInfo")
        .and_then(|si| si.get("name"))
        .and_then(Value::as_str)
        .unwrap_or(&name)
        .to_string();

    eprintln!("[MCP] Registered & connected: {} (server={})", name, label);

    let mut configs = load_server_configs(&app)?;
    configs.retain(|c| c.name != name);
    configs.push(McpServerConfig {
        name: name.clone(),
        cmd,
        args: args,
    });
    save_server_configs(&app, &configs)?;

    Ok(label)
}
