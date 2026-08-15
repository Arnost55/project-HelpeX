mod audit;
pub mod authorization;
mod client;
mod permissions;
mod protocol;
mod schema;

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use audit::{log_tool_audit, redact_json_value, summarize_json_value, ToolAuditEntry};
use authorization::{
    authorize_request, build_action_context, ActionContext, AuthorizationDecision,
    RequestAuthority, RequestOrigin,
};
use client::{McpClient, McpClientError};
use permissions::{
    load_permission_policy, PermissionDecision, PermissionEvaluation, PermissionLevel,
};
pub use protocol::McpTool;
use protocol::{extract_tools_from_list_result, parse_tool_call_is_error};
use schema::validate_tool_arguments;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};
use tokio::io::AsyncBufReadExt;
use tokio::process::{Child, ChildStderr, Command};
use tokio::sync::{oneshot, Mutex, RwLock};
use uuid::Uuid;

use crate::agent::cancellation::StreamCancellationToken;

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

pub struct McpSystemState {
    pub servers: Arc<RwLock<HashMap<String, Arc<ActiveServer>>>>,
    pub pending_approvals: Arc<Mutex<HashMap<String, PendingApproval>>>,
}

pub struct PendingApproval {
    pub snapshot: PendingApprovalSnapshot,
    pub frozen_request: ToolExecutionRequest,
    pub response_tx: oneshot::Sender<ApprovalResolution>,
}

impl Default for McpSystemState {
    fn default() -> Self {
        Self {
            servers: Arc::new(RwLock::new(HashMap::new())),
            pending_approvals: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ToolExecutionRequest {
    pub server_name: String,
    pub tool_name: String,
    pub arguments: Value,
    pub stream_id: Option<String>,
    pub approval_id: Option<String>,
    pub tool_alias: Option<String>,
    pub tool_description: Option<String>,
    pub action_context: ActionContext,
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
    pub authorization: AuthorizationDecision,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolApprovalRequestEvent {
    pub approval_id: String,
    pub stream_id: Option<String>,
    pub provider_tool_name: Option<String>,
    pub server_name: String,
    pub tool_name: String,
    pub arguments: Value,
    pub permission: PermissionEvaluation,
    pub risk_level: ApprovalRiskLevel,
    pub action_label: String,
    pub description: Option<String>,
    pub requested_at_ms: u64,
    pub expires_at_ms: u64,
    pub request_origin: RequestOrigin,
    pub capability: CapabilitySummary,
    pub scope: ResourceScopeSummary,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolApprovalResolvedEvent {
    pub approval_id: String,
    pub stream_id: Option<String>,
    pub server_name: String,
    pub tool_name: String,
    pub status: ApprovalStatus,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ApprovalRiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ApprovalStatus {
    Approved,
    Denied,
    Expired,
    Cancelled,
    Invalidated,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingApprovalSnapshot {
    pub id: String,
    pub stream_id: Option<String>,
    pub server_name: String,
    pub tool_name: String,
    pub provider_tool_name: Option<String>,
    pub arguments: Value,
    pub permission: PermissionEvaluation,
    pub description: Option<String>,
    pub action_label: String,
    pub requested_at_ms: u64,
    pub expires_at_ms: u64,
    pub risk_level: ApprovalRiskLevel,
    pub request_origin: RequestOrigin,
    pub capability: CapabilitySummary,
    pub scope: ResourceScopeSummary,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilitySummary {
    pub action: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceScopeSummary {
    pub kind: String,
    pub identifier: String,
}

#[derive(Debug, Clone)]
enum ApprovalResolution {
    AllowOnce,
    Deny,
    Expired,
    Cancelled,
    Invalidated,
}

#[derive(Debug, Clone)]
pub enum ToolExecutionErrorKind {
    ServerNotFound,
    ToolNotFound,
    InvalidArguments,
    PermissionDenied,
    PermissionRequired,
    ApprovalExpired,
    ApprovalRejected,
    ApprovalInvalidated,
    Cancelled,
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
            ToolExecutionErrorKind::ApprovalExpired => "approval_expired",
            ToolExecutionErrorKind::ApprovalRejected => "approval_denied",
            ToolExecutionErrorKind::ApprovalInvalidated => "approval_invalidated",
            ToolExecutionErrorKind::Cancelled => "cancelled",
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
        McpClientError::Cancelled { message } => {
            ToolExecutionError::new(ToolExecutionErrorKind::Cancelled, message)
        }
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
    mut request: ToolExecutionRequest,
    cancellation: Option<StreamCancellationToken>,
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
    let authorization = authorize_request(
        &policy,
        &request.server_name,
        &tool,
        request.action_context.clone(),
    );

    if authorization.decision == PermissionDecision::Ask {
        let state = app_handle.state::<McpSystemState>();
        request_tool_approval(
            app_handle,
            &state,
            &mut request,
            &authorization,
            cancellation.clone(),
        )
        .await?;
    } else if authorization.decision != PermissionDecision::Allow {
        let error = ToolExecutionError::new(
            ToolExecutionErrorKind::PermissionDenied,
            format!(
                "Permission {:?} for '{}.{}' ({:?})",
                authorization.decision, request.server_name, request.tool_name, authorization.level
            ),
        )
        .with_permission(authorization.permission.clone());

        let audit_entry = ToolAuditEntry::from_denied_request(&request, &authorization, &error);
        let _ = log_tool_audit(app_handle, &audit_entry).await;
        return Err(error);
    }

    if let Some(token) = cancellation.as_ref() {
        if token.is_cancelled() {
            let error = ToolExecutionError::new(
                ToolExecutionErrorKind::Cancelled,
                format!(
                    "Tool execution cancelled before '{}.{}' ran",
                    request.server_name, request.tool_name
                ),
            )
            .with_permission(authorization.permission.clone());
            let audit_entry =
                ToolAuditEntry::from_cancelled_request(&request, &authorization, &error);
            let _ = log_tool_audit(app_handle, &audit_entry).await;
            return Err(error);
        }
    }

    let started = Instant::now();
    let response = server
        .client
        .request_with_cancel(
            "tools/call",
            json!({
                "name": request.tool_name.clone(),
                "arguments": request.arguments.clone()
            }),
            MCP_TOOL_CALL_TIMEOUT_MS,
            cancellation.clone(),
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
        authorization: authorization.clone(),
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
            approval_id: None,
            tool_alias: None,
            tool_description: None,
            action_context: ActionContext {
                origin: RequestOrigin::DirectUser,
                authority: RequestAuthority::DirectUserInstruction,
                capability: authorization::CapabilityDescriptor {
                    action: "manual.tool_call".to_string(),
                    target: "manual".to_string(),
                },
                scope: authorization::ResourceScope {
                    kind: "tool".to_string(),
                    identifier: "manual".to_string(),
                },
                provider_tool_name: None,
            },
        },
        None,
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

    invalidate_approvals_for_server(&app_handle, &state, &name).await;

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

fn next_approval_request_id() -> String {
    Uuid::new_v4().to_string()
}

fn now_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn risk_level_for_permission(level: PermissionLevel) -> ApprovalRiskLevel {
    match level {
        PermissionLevel::Read => ApprovalRiskLevel::Low,
        PermissionLevel::Unknown => ApprovalRiskLevel::Medium,
        PermissionLevel::Write => ApprovalRiskLevel::High,
        PermissionLevel::Execute => ApprovalRiskLevel::High,
        PermissionLevel::Sensitive => ApprovalRiskLevel::Critical,
    }
}

fn approval_action_label(request: &ToolExecutionRequest) -> String {
    request
        .tool_description
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| request.tool_name.clone())
}

fn build_approval_snapshot(
    request_id: String,
    request: &ToolExecutionRequest,
    authorization: &AuthorizationDecision,
) -> PendingApprovalSnapshot {
    let requested_at_ms = now_timestamp_ms();
    PendingApprovalSnapshot {
        id: request_id,
        stream_id: request.stream_id.clone(),
        server_name: request.server_name.clone(),
        tool_name: request.tool_name.clone(),
        provider_tool_name: request.tool_alias.clone(),
        arguments: redacted_arguments(&request.arguments),
        permission: authorization.permission.clone(),
        description: request.tool_description.clone(),
        action_label: approval_action_label(request),
        requested_at_ms,
        expires_at_ms: requested_at_ms + 300_000,
        risk_level: risk_level_for_permission(authorization.level),
        request_origin: request.action_context.origin.clone(),
        capability: CapabilitySummary {
            action: request.action_context.capability.action.clone(),
            target: request.action_context.capability.target.clone(),
        },
        scope: ResourceScopeSummary {
            kind: request.action_context.scope.kind.clone(),
            identifier: request.action_context.scope.identifier.clone(),
        },
    }
}

fn emit_approval_resolved(
    app_handle: &AppHandle,
    approval: &PendingApprovalSnapshot,
    status: ApprovalStatus,
) {
    let _ = app_handle.emit(
        "agent-tool-approval-resolved",
        ToolApprovalResolvedEvent {
            approval_id: approval.id.clone(),
            stream_id: approval.stream_id.clone(),
            server_name: approval.server_name.clone(),
            tool_name: approval.tool_name.clone(),
            status,
        },
    );
}

async fn invalidate_approvals_for_server(
    app_handle: &AppHandle,
    state: &McpSystemState,
    server_name: &str,
) {
    let approvals = {
        let mut pending = state.pending_approvals.lock().await;
        let ids = pending
            .iter()
            .filter(|(_, approval)| approval.snapshot.server_name == server_name)
            .map(|(id, _)| id.clone())
            .collect::<Vec<_>>();
        ids.into_iter()
            .filter_map(|id| pending.remove(&id))
            .collect::<Vec<_>>()
    };

    for approval in approvals {
        emit_approval_resolved(app_handle, &approval.snapshot, ApprovalStatus::Invalidated);
        let _ = approval.response_tx.send(ApprovalResolution::Invalidated);
    }
}

async fn request_tool_approval(
    app_handle: &AppHandle,
    state: &McpSystemState,
    request: &mut ToolExecutionRequest,
    authorization: &AuthorizationDecision,
    cancellation: Option<StreamCancellationToken>,
) -> Result<(), ToolExecutionError> {
    let request_id = next_approval_request_id();
    request.approval_id = Some(request_id.clone());
    let (response_tx, response_rx) = oneshot::channel();
    let snapshot = build_approval_snapshot(request_id.clone(), request, authorization);

    {
        let mut pending = state.pending_approvals.lock().await;
        pending.insert(
            request_id.clone(),
            PendingApproval {
                snapshot: snapshot.clone(),
                frozen_request: request.clone(),
                response_tx,
            },
        );
    }

    let emit_result = app_handle.emit(
        "agent-tool-approval-request",
        ToolApprovalRequestEvent {
            approval_id: snapshot.id.clone(),
            stream_id: snapshot.stream_id.clone(),
            provider_tool_name: snapshot.provider_tool_name.clone(),
            server_name: snapshot.server_name.clone(),
            tool_name: snapshot.tool_name.clone(),
            arguments: snapshot.arguments.clone(),
            permission: snapshot.permission.clone(),
            risk_level: snapshot.risk_level,
            action_label: snapshot.action_label.clone(),
            description: snapshot.description.clone(),
            requested_at_ms: snapshot.requested_at_ms,
            expires_at_ms: snapshot.expires_at_ms,
            request_origin: snapshot.request_origin.clone(),
            capability: snapshot.capability.clone(),
            scope: snapshot.scope.clone(),
        },
    );

    if let Err(error) = emit_result {
        let mut pending = state.pending_approvals.lock().await;
        pending.remove(&request_id);
        return Err(ToolExecutionError::new(
            ToolExecutionErrorKind::PermissionRequired,
            format!("Failed to emit approval request: {}", error),
        )
        .with_permission(authorization.permission.clone()));
    }

    let mut approval_timeout = tokio::time::sleep(Duration::from_secs(300));
    tokio::pin!(approval_timeout);

    let resolution = if let Some(token) = cancellation {
        let mut cancel_wait = token.child_token();
        tokio::select! {
            result = response_rx => result.map_err(|_| {
                ToolExecutionError::new(
                    ToolExecutionErrorKind::PermissionRequired,
                    format!(
                        "Approval channel closed for '{}.{}'",
                        request.server_name, request.tool_name
                    ),
                )
                .with_permission(authorization.permission.clone())
            })?,
            _ = &mut approval_timeout => ApprovalResolution::Expired,
            _ = cancel_wait.cancelled() => ApprovalResolution::Cancelled,
        }
    } else {
        tokio::select! {
            result = response_rx => result.map_err(|_| {
                ToolExecutionError::new(
                    ToolExecutionErrorKind::PermissionRequired,
                    format!(
                        "Approval channel closed for '{}.{}'",
                        request.server_name, request.tool_name
                    ),
                )
                .with_permission(authorization.permission.clone())
            })?,
            _ = &mut approval_timeout => ApprovalResolution::Expired,
        }
    };

    match resolution {
        ApprovalResolution::AllowOnce => Ok(()),
        ApprovalResolution::Deny => {
            let error = ToolExecutionError::new(
                ToolExecutionErrorKind::ApprovalRejected,
                format!(
                    "User denied approval for '{}.{}' ({:?})",
                    request.server_name, request.tool_name, authorization.level
                ),
            )
            .with_permission(authorization.permission.clone());
            let audit_entry = ToolAuditEntry::from_denied_request(request, authorization, &error);
            let _ = log_tool_audit(app_handle, &audit_entry).await;
            Err(error)
        }
        ApprovalResolution::Cancelled => {
            let mut pending = state.pending_approvals.lock().await;
            pending.remove(&request_id);
            emit_approval_resolved(app_handle, &snapshot, ApprovalStatus::Cancelled);
            let error = ToolExecutionError::new(
                ToolExecutionErrorKind::Cancelled,
                format!(
                    "Approval wait cancelled for '{}.{}'",
                    request.server_name, request.tool_name
                ),
            )
            .with_permission(authorization.permission.clone());
            let audit_entry =
                ToolAuditEntry::from_cancelled_request(request, authorization, &error);
            let _ = log_tool_audit(app_handle, &audit_entry).await;
            Err(error)
        }
        ApprovalResolution::Expired => {
            let mut pending = state.pending_approvals.lock().await;
            pending.remove(&request_id);
            emit_approval_resolved(app_handle, &snapshot, ApprovalStatus::Expired);
            let error = ToolExecutionError::new(
                ToolExecutionErrorKind::ApprovalExpired,
                format!(
                    "Approval expired for '{}.{}'",
                    request.server_name, request.tool_name
                ),
            )
            .with_permission(authorization.permission.clone());
            let audit_entry = ToolAuditEntry::from_denied_request(request, authorization, &error);
            let _ = log_tool_audit(app_handle, &audit_entry).await;
            Err(error)
        }
        ApprovalResolution::Invalidated => {
            emit_approval_resolved(app_handle, &snapshot, ApprovalStatus::Invalidated);
            let error = ToolExecutionError::new(
                ToolExecutionErrorKind::ApprovalInvalidated,
                format!(
                    "Approval invalidated for '{}.{}'",
                    request.server_name, request.tool_name
                ),
            )
            .with_permission(authorization.permission.clone());
            let audit_entry = ToolAuditEntry::from_denied_request(request, authorization, &error);
            let _ = log_tool_audit(app_handle, &audit_entry).await;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn mcp_respond_to_permission_request(
    app_handle: AppHandle,
    state: State<'_, McpSystemState>,
    approval_id: String,
    allow: bool,
) -> Result<(), String> {
    let mut pending = state.pending_approvals.lock().await;
    let approval = pending
        .remove(&approval_id)
        .ok_or_else(|| format!("Approval request '{}' was not found", approval_id))?;

    let status = if allow {
        ApprovalStatus::Approved
    } else {
        ApprovalStatus::Denied
    };
    emit_approval_resolved(&app_handle, &approval.snapshot, status);

    approval
        .response_tx
        .send(if allow {
            ApprovalResolution::AllowOnce
        } else {
            ApprovalResolution::Deny
        })
        .map_err(|_| format!("Approval request '{}' is no longer waiting", approval_id))
}
