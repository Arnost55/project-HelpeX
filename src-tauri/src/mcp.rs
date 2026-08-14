mod audit;
mod client;
mod permissions;
mod protocol;
mod schema;

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Instant;

use audit::{log_tool_audit, redact_json_value, summarize_json_value, ToolAuditEntry};
use client::{McpClient, McpClientError};
use permissions::{
    evaluate_permission, load_permission_policy, PermissionDecision, PermissionEvaluation,
};
pub use protocol::McpTool;
use protocol::{extract_tools_from_list_result, parse_tool_call_is_error};
use schema::validate_tool_arguments;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};
use tokio::io::AsyncBufReadExt;
use tokio::process::{Child, ChildStderr, Command};
use tokio::sync::{Mutex, RwLock};

const MCP_PROTOCOL_VERSION: &str = "2024-11-05";
const MCP_INIT_TIMEOUT_MS: u64 = 15_000;
const MCP_LIST_TOOLS_TIMEOUT_MS: u64 = 15_000;
const MCP_TOOL_CALL_TIMEOUT_MS: u64 = 30_000;

pub struct ActiveServer {
    pub name: String,
    pub cmd: String,
    pub args: Vec<String>,
    pub process: Arc<Mutex<Child>>,
    pub client: Arc<McpClient>,
    pub tools: Arc<RwLock<HashMap<String, McpTool>>>,
}

#[derive(Default)]
pub struct McpSystemState {
    pub servers: Arc<RwLock<HashMap<String, Arc<ActiveServer>>>>,
}

#[derive(Debug, Clone)]
pub struct ToolExecutionRequest {
    pub server_name: String,
    pub tool_name: String,
    pub arguments: Value,
    pub stream_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolExecutionOutcome {
    pub server_name: String,
    pub tool_name: String,
    pub result: Value,
    pub is_error: bool,
    pub duration_ms: u128,
    pub result_summary: String,
    pub permission: PermissionEvaluation,
}

#[derive(Debug, Clone)]
pub enum ToolExecutionErrorKind {
    ServerNotFound,
    ToolNotFound,
    InvalidArguments,
    PermissionDenied,
    PermissionRequired,
    Timeout,
    Disconnected,
    JsonRpc,
    MalformedResponse,
}

#[derive(Debug, Clone)]
pub struct ToolExecutionError {
    pub kind: ToolExecutionErrorKind,
    pub message: String,
    pub permission: Option<PermissionEvaluation>,
    pub details: Option<Value>,
}

impl ToolExecutionError {
    fn new(kind: ToolExecutionErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            permission: None,
            details: None,
        }
    }

    fn with_permission(mut self, permission: PermissionEvaluation) -> Self {
        self.permission = Some(permission);
        self
    }

    fn with_details(mut self, details: Value) -> Self {
        self.details = Some(details);
        self
    }

    pub fn code(&self) -> &'static str {
        match self.kind {
            ToolExecutionErrorKind::ServerNotFound => "server_not_found",
            ToolExecutionErrorKind::ToolNotFound => "tool_not_found",
            ToolExecutionErrorKind::InvalidArguments => "invalid_arguments",
            ToolExecutionErrorKind::PermissionDenied => "permission_denied",
            ToolExecutionErrorKind::PermissionRequired => "permission_required",
            ToolExecutionErrorKind::Timeout => "timeout",
            ToolExecutionErrorKind::Disconnected => "disconnected",
            ToolExecutionErrorKind::JsonRpc => "jsonrpc_error",
            ToolExecutionErrorKind::MalformedResponse => "malformed_response",
        }
    }
}

impl std::fmt::Display for ToolExecutionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

pub fn resolve_executable_path(cmd: &str) -> String {
    let target = cmd.trim();

    if target.contains('/') || target.contains('\\') {
        return target.to_string();
    }

    #[cfg(target_os = "windows")]
    {
        let app_data = std::env::var("APPDATA").unwrap_or_default();
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let program_files = std::env::var("ProgramFiles").unwrap_or_default();

        match target {
            "npx" | "npm" | "node" => {
                let paths = vec![
                    format!(r"{}\nodejs\{}.cmd", program_files, target),
                    format!(r"{}\npm\{}.cmd", app_data, target),
                    format!(r"{}\volta\{}.cmd", app_data, target),
                    format!(r"{}\fnm\{}.exe", local_app_data, target),
                ];
                for path in paths {
                    if std::path::Path::new(&path).exists() {
                        return path;
                    }
                }
            }
            "uvx" | "uv" => {
                let path = format!(r"{}\Programs\uv\{}.exe", local_app_data, target);
                if std::path::Path::new(&path).exists() {
                    return path;
                }
            }
            _ => {}
        }
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        match target {
            "npx" | "npm" | "node" => {
                let paths = vec![
                    format!("/usr/local/bin/{}", target),
                    format!("/usr/bin/{}", target),
                    format!("{}/.nvm/versions/node/current/bin/{}", home, target),
                    format!("{}/.local/share/fnm/bin/{}", home, target),
                ];
                for path in paths {
                    if std::path::Path::new(&path).exists() {
                        return path;
                    }
                }
            }
            "uvx" | "uv" => {
                let paths = vec![
                    format!("{}/.local/bin/{}", home, target),
                    format!("/usr/local/bin/{}", target),
                ];
                for path in paths {
                    if std::path::Path::new(&path).exists() {
                        return path;
                    }
                }
            }
            _ => {}
        }
    }

    target.to_string()
}

async fn spawn_server_process(
    name: &str,
    cmd: &str,
    args: &[String],
) -> Result<(Child, Arc<McpClient>), String> {
    let resolved_cmd = resolve_executable_path(cmd);
    println!(
        "[MCP] Spawning '{}' via '{}' with args {:?}",
        name, resolved_cmd, args
    );

    let mut command_builder = Command::new(&resolved_cmd);
    command_builder.args(args);
    command_builder.stdin(Stdio::piped());
    command_builder.stdout(Stdio::piped());
    command_builder.stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        command_builder.creation_flags(0x08000000);
    }

    let mut child = command_builder.spawn().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            format!(
                "Executable '{}' could not be resolved. PATH snapshot: {}",
                cmd,
                std::env::var("PATH").unwrap_or_default()
            )
        } else {
            format!("Failed to spawn process: {}", error)
        }
    })?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to capture child stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture child stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture child stderr".to_string())?;

    spawn_stderr_logger(name.to_string(), stderr);

    let client = Arc::new(McpClient::new(name.to_string(), stdin, stdout));
    Ok((child, client))
}

fn spawn_stderr_logger(name: String, stderr: ChildStderr) {
    tokio::spawn(async move {
        let mut lines = tokio::io::BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("[MCP:{}:stderr] {}", name, line);
        }
    });
}

fn to_tool_map(tools: Vec<McpTool>) -> HashMap<String, McpTool> {
    tools
        .into_iter()
        .map(|tool| (tool.name.clone(), tool))
        .collect()
}

async fn initialize_server(name: &str, client: &McpClient) -> Result<Vec<McpTool>, String> {
    client
        .request(
            "initialize",
            json!({
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": { "name": "HelpeX", "version": "1.0.0" }
            }),
            MCP_INIT_TIMEOUT_MS,
        )
        .await
        .map_err(|error| format!("Initialize failed for '{}': {}", name, error))?;

    client
        .notify("notifications/initialized", json!({}))
        .await
        .map_err(|error| format!("Initialized notification failed for '{}': {}", name, error))?;

    let tool_result = client
        .request("tools/list", json!({}), MCP_LIST_TOOLS_TIMEOUT_MS)
        .await
        .map_err(|error| format!("Tool discovery failed for '{}': {}", name, error))?;

    extract_tools_from_list_result(&tool_result)
        .map_err(|error| format!("Invalid tools/list result for '{}': {}", name, error))
}

async fn upsert_active_server(
    state: &McpSystemState,
    server: Arc<ActiveServer>,
) -> Result<(), String> {
    let mut active_map = state.servers.write().await;
    active_map.insert(server.name.clone(), server);
    Ok(())
}

async fn get_active_server(state: &McpSystemState, name: &str) -> Option<Arc<ActiveServer>> {
    let active_map = state.servers.read().await;
    active_map.get(name).cloned()
}

async fn spawn_and_register_server(
    app_handle: &AppHandle,
    name: String,
    cmd: String,
    args: Vec<String>,
    persist_config: bool,
) -> Result<Vec<McpTool>, String> {
    let state = app_handle.state::<McpSystemState>();

    if let Some(existing) = get_active_server(&state, &name).await {
        if existing.cmd == cmd && existing.args == args {
            let tools = existing
                .tools
                .read()
                .await
                .values()
                .cloned()
                .collect::<Vec<_>>();
            return Ok(tools);
        }

        return Err(format!(
            "An MCP server named '{}' is already active with a different command",
            name
        ));
    }

    let (child, client) = spawn_server_process(&name, &cmd, &args).await?;
    let tools = initialize_server(&name, &client).await?;

    let server = Arc::new(ActiveServer {
        name: name.clone(),
        cmd: cmd.clone(),
        args: args.clone(),
        process: Arc::new(Mutex::new(child)),
        client,
        tools: Arc::new(RwLock::new(to_tool_map(tools.clone()))),
    });

    upsert_active_server(&state, server).await?;

    if persist_config {
        let mut persisted = load_persisted_servers(app_handle).unwrap_or_default();
        if let Some(position) = persisted.iter().position(|server| server.name == name) {
            persisted[position] = PersistedServer { name, cmd, args };
        } else {
            persisted.push(PersistedServer { name, cmd, args });
        }
        save_persisted_servers(app_handle, &persisted)?;
    }

    Ok(tools)
}

fn map_client_error(error: McpClientError) -> ToolExecutionError {
    match error {
        McpClientError::Timeout { message } => {
            ToolExecutionError::new(ToolExecutionErrorKind::Timeout, message)
        }
        McpClientError::Disconnected { message } => {
            ToolExecutionError::new(ToolExecutionErrorKind::Disconnected, message)
        }
        McpClientError::JsonRpc { message, data } => {
            ToolExecutionError::new(ToolExecutionErrorKind::JsonRpc, message)
                .with_details(data.unwrap_or(Value::Null))
        }
        McpClientError::MalformedResponse { message, data } => {
            ToolExecutionError::new(ToolExecutionErrorKind::MalformedResponse, message)
                .with_details(data.unwrap_or(Value::Null))
        }
        McpClientError::Io(message) => {
            ToolExecutionError::new(ToolExecutionErrorKind::Disconnected, message)
        }
        McpClientError::Serialization(message) => {
            ToolExecutionError::new(ToolExecutionErrorKind::MalformedResponse, message)
        }
    }
}

pub async fn execute_tool(
    app_handle: &AppHandle,
    request: ToolExecutionRequest,
) -> Result<ToolExecutionOutcome, ToolExecutionError> {
    let state = app_handle.state::<McpSystemState>();
    let server = get_active_server(&state, &request.server_name)
        .await
        .ok_or_else(|| {
            ToolExecutionError::new(
                ToolExecutionErrorKind::ServerNotFound,
                format!("MCP server '{}' is not active", request.server_name),
            )
        })?;

    let tool = {
        let tools = server.tools.read().await;
        tools.get(&request.tool_name).cloned().ok_or_else(|| {
            ToolExecutionError::new(
                ToolExecutionErrorKind::ToolNotFound,
                format!(
                    "Tool '{}' is not registered on server '{}'",
                    request.tool_name, request.server_name
                ),
            )
        })?
    };

    validate_tool_arguments(&tool.input_schema, &request.arguments).map_err(|issues| {
        ToolExecutionError::new(
            ToolExecutionErrorKind::InvalidArguments,
            format!(
                "Invalid arguments for '{}.{}': {}",
                request.server_name,
                request.tool_name,
                issues.join("; ")
            ),
        )
        .with_details(json!({ "issues": issues }))
    })?;

    let policy = load_permission_policy(app_handle).await.map_err(|error| {
        ToolExecutionError::new(
            ToolExecutionErrorKind::PermissionDenied,
            format!("Failed to load MCP permission policy: {}", error),
        )
    })?;
    let permission = evaluate_permission(&policy, &request.server_name, &tool);

    if permission.decision != PermissionDecision::Allow {
        let error_kind = if permission.decision == PermissionDecision::Ask {
            ToolExecutionErrorKind::PermissionRequired
        } else {
            ToolExecutionErrorKind::PermissionDenied
        };
        let error = ToolExecutionError::new(
            error_kind,
            format!(
                "Permission {:?} for '{}.{}' ({:?})",
                permission.decision, request.server_name, request.tool_name, permission.level
            ),
        )
        .with_permission(permission.clone());

        let audit_entry = ToolAuditEntry::from_denied_request(&request, &permission, &error);
        let _ = log_tool_audit(app_handle, &audit_entry).await;
        return Err(error);
    }

    let started = Instant::now();
    let response = server
        .client
        .request(
            "tools/call",
            json!({
                "name": request.tool_name,
                "arguments": request.arguments
            }),
            MCP_TOOL_CALL_TIMEOUT_MS,
        )
        .await
        .map_err(map_client_error)?;

    let duration_ms = started.elapsed().as_millis();
    let is_error = parse_tool_call_is_error(&response);
    let result_summary = summarize_json_value(&response);

    let outcome = ToolExecutionOutcome {
        server_name: request.server_name.clone(),
        tool_name: request.tool_name.clone(),
        result: response.clone(),
        is_error,
        duration_ms,
        result_summary: result_summary.clone(),
        permission: permission.clone(),
    };

    let audit_entry = ToolAuditEntry::from_outcome(&request, &outcome);
    let _ = log_tool_audit(app_handle, &audit_entry).await;

    Ok(outcome)
}

#[tauri::command]
pub async fn mcp_spawn_and_initialize(
    app_handle: AppHandle,
    name: String,
    cmd: String,
    args: Vec<String>,
) -> Result<Vec<McpTool>, String> {
    spawn_and_register_server(&app_handle, name, cmd, args, true).await
}

#[tauri::command]
pub async fn mcp_get_active_tools(
    state: State<'_, McpSystemState>,
) -> Result<HashMap<String, Vec<McpTool>>, String> {
    let active_map = state.servers.read().await;
    let mut summary = HashMap::new();
    for (server_name, server) in active_map.iter() {
        let tools = server
            .tools
            .read()
            .await
            .values()
            .cloned()
            .collect::<Vec<_>>();
        summary.insert(server_name.clone(), tools);
    }
    Ok(summary)
}

#[tauri::command]
pub async fn mcp_execute_tool(
    app_handle: AppHandle,
    server_name: String,
    tool_name: String,
    arguments: Value,
) -> Result<Value, String> {
    let outcome = execute_tool(
        &app_handle,
        ToolExecutionRequest {
            server_name,
            tool_name,
            arguments,
            stream_id: None,
        },
    )
    .await
    .map_err(|error| error.to_string())?;

    Ok(outcome.result)
}

#[tauri::command]
pub async fn mcp_disconnect_server(app_handle: AppHandle, name: String) -> Result<(), String> {
    let state = app_handle.state::<McpSystemState>();

    let server = {
        let mut active_map = state.servers.write().await;
        active_map.remove(&name)
    };

    let Some(server) = server else {
        return Err(format!("No active MCP server named '{}'", name));
    };

    server.client.close().await;

    let mut child = server.process.lock().await;
    child
        .kill()
        .await
        .map_err(|error| format!("Failed to terminate '{}': {}", name, error))?;

    let mut persisted = load_persisted_servers(&app_handle).unwrap_or_default();
    persisted.retain(|server| server.name != name);
    save_persisted_servers(&app_handle, &persisted)?;

    Ok(())
}

#[tauri::command]
pub async fn mcp_hydrate_saved_servers(app_handle: AppHandle) -> Result<(), String> {
    let persisted = load_persisted_servers(&app_handle)?;
    for server in persisted {
        let handle = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) =
                spawn_and_register_server(&handle, server.name, server.cmd, server.args, false)
                    .await
            {
                eprintln!("[MCP] Failed to hydrate server: {}", error);
            }
        });
    }

    Ok(())
}

pub async fn auto_spawn_and_register(
    app_handle: &AppHandle,
    name: &str,
    cmd: &str,
    args: &[String],
) -> Result<(), String> {
    spawn_and_register_server(
        app_handle,
        name.to_string(),
        cmd.to_string(),
        args.to_vec(),
        false,
    )
    .await
    .map(|_| ())
}

pub async fn active_tool_count(state: &McpSystemState) -> usize {
    let active_map = state.servers.read().await;
    let mut total = 0usize;
    for server in active_map.values() {
        total += server.tools.read().await.len();
    }
    total
}

pub async fn collect_active_tools(state: &McpSystemState) -> Vec<(String, McpTool)> {
    let active_map = state.servers.read().await;
    let mut tools = Vec::new();
    for (server_name, server) in active_map.iter() {
        let server_tools = server.tools.read().await;
        for tool in server_tools.values() {
            tools.push((server_name.clone(), tool.clone()));
        }
    }
    tools
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedServer {
    pub name: String,
    pub cmd: String,
    pub args: Vec<String>,
}

pub fn get_mcp_config_path(app_handle: &AppHandle) -> std::path::PathBuf {
    app_handle
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("mcp_config.dat")
}

fn save_persisted_servers(
    app_handle: &AppHandle,
    configs: &[PersistedServer],
) -> Result<(), String> {
    let path = get_mcp_config_path(app_handle);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let json = serde_json::to_string_pretty(configs).map_err(|error| error.to_string())?;
    std::fs::write(&path, json).map_err(|error| error.to_string())
}

pub fn load_persisted_servers(app_handle: &AppHandle) -> Result<Vec<PersistedServer>, String> {
    let path = get_mcp_config_path(app_handle);
    if !path.exists() {
        return Ok(Vec::new());
    }

    let json = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    serde_json::from_str(&json).map_err(|error| error.to_string())
}

pub fn structured_tool_error(error: &ToolExecutionError) -> Value {
    json!({
        "ok": false,
        "code": error.code(),
        "message": error.message,
        "permission": error.permission,
        "details": error.details,
    })
}

pub fn redacted_arguments(value: &Value) -> Value {
    redact_json_value(value)
}
