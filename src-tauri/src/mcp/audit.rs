use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use super::authorization::AuthorizationDecision;
use super::permissions::PermissionDecision;
use super::{ToolExecutionError, ToolExecutionOutcome, ToolExecutionRequest};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolAuditEntry {
    pub timestamp_ms: u64,
    pub session_id: Option<String>,
    pub request_origin: String,
    pub server_name: String,
    pub tool_name: String,
    pub provider_tool_name: Option<String>,
    pub arguments: Value,
    pub permission_decision: PermissionDecision,
    pub permission_level: String,
    pub authorization_source: String,
    pub capability_action: String,
    pub capability_target: String,
    pub scope_kind: String,
    pub scope_identifier: String,
    pub approval_id: Option<String>,
    pub approval_result: Option<String>,
    pub duration_ms: Option<u128>,
    pub success: bool,
    pub result_summary: Option<String>,
    pub error_class: Option<String>,
    pub error: Option<String>,
}

impl ToolAuditEntry {
    pub fn from_outcome(request: &ToolExecutionRequest, outcome: &ToolExecutionOutcome) -> Self {
        Self {
            timestamp_ms: now_timestamp_ms(),
            session_id: request.stream_id.clone(),
            request_origin: format!("{:?}", request.action_context.origin),
            server_name: request.server_name.clone(),
            tool_name: request.tool_name.clone(),
            provider_tool_name: request.tool_alias.clone(),
            arguments: redact_json_value(&request.arguments),
            permission_decision: outcome.authorization.decision,
            permission_level: format!("{:?}", outcome.authorization.level),
            authorization_source: outcome.authorization.source.clone(),
            capability_action: request.action_context.capability.action.clone(),
            capability_target: request.action_context.capability.target.clone(),
            scope_kind: request.action_context.scope.kind.clone(),
            scope_identifier: request.action_context.scope.identifier.clone(),
            approval_id: request.approval_id.clone(),
            approval_result: if outcome.authorization.decision == PermissionDecision::Ask {
                Some("allow_once".to_string())
            } else {
                None
            },
            duration_ms: Some(outcome.duration_ms),
            success: !outcome.is_error,
            result_summary: Some(outcome.result_summary.clone()),
            error_class: if outcome.is_error {
                Some("tool_error".to_string())
            } else {
                None
            },
            error: if outcome.is_error {
                Some("tool returned isError=true".to_string())
            } else {
                None
            },
        }
    }

    pub fn from_denied_request(
        request: &ToolExecutionRequest,
        authorization: &AuthorizationDecision,
        error: &ToolExecutionError,
    ) -> Self {
        Self {
            timestamp_ms: now_timestamp_ms(),
            session_id: request.stream_id.clone(),
            request_origin: format!("{:?}", request.action_context.origin),
            server_name: request.server_name.clone(),
            tool_name: request.tool_name.clone(),
            provider_tool_name: request.tool_alias.clone(),
            arguments: redact_json_value(&request.arguments),
            permission_decision: authorization.decision,
            permission_level: format!("{:?}", authorization.level),
            authorization_source: authorization.source.clone(),
            capability_action: request.action_context.capability.action.clone(),
            capability_target: request.action_context.capability.target.clone(),
            scope_kind: request.action_context.scope.kind.clone(),
            scope_identifier: request.action_context.scope.identifier.clone(),
            approval_id: request.approval_id.clone(),
            approval_result: denied_approval_result(error),
            duration_ms: None,
            success: false,
            result_summary: None,
            error_class: Some(error.code().to_string()),
            error: Some(error.message.clone()),
        }
    }

    pub fn from_cancelled_request(
        request: &ToolExecutionRequest,
        authorization: &AuthorizationDecision,
        error: &ToolExecutionError,
    ) -> Self {
        Self {
            timestamp_ms: now_timestamp_ms(),
            session_id: request.stream_id.clone(),
            request_origin: format!("{:?}", request.action_context.origin),
            server_name: request.server_name.clone(),
            tool_name: request.tool_name.clone(),
            provider_tool_name: request.tool_alias.clone(),
            arguments: redact_json_value(&request.arguments),
            permission_decision: authorization.decision,
            permission_level: format!("{:?}", authorization.level),
            authorization_source: authorization.source.clone(),
            capability_action: request.action_context.capability.action.clone(),
            capability_target: request.action_context.capability.target.clone(),
            scope_kind: request.action_context.scope.kind.clone(),
            scope_identifier: request.action_context.scope.identifier.clone(),
            approval_id: request.approval_id.clone(),
            approval_result: Some("cancelled".to_string()),
            duration_ms: None,
            success: false,
            result_summary: None,
            error_class: Some(error.code().to_string()),
            error: Some(error.message.clone()),
        }
    }
}

pub async fn log_tool_audit(app_handle: &AppHandle, entry: &ToolAuditEntry) -> Result<(), String> {
    let path = get_audit_path(app_handle);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| error.to_string())?;
    }

    let mut line = serde_json::to_string(entry).map_err(|error| error.to_string())?;
    line.push('\n');

    use tokio::io::AsyncWriteExt;
    let mut file = tokio::fs::OpenOptions::new()
        .append(true)
        .create(true)
        .open(path)
        .await
        .map_err(|error| error.to_string())?;
    file.write_all(line.as_bytes())
        .await
        .map_err(|error| error.to_string())
}

fn get_audit_path(app_handle: &AppHandle) -> std::path::PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("mcp_tool_audit.jsonl")
}

fn now_timestamp_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub fn redact_json_value(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut next = serde_json::Map::new();
            for (key, nested) in map {
                if is_sensitive_key(key) {
                    next.insert(key.clone(), Value::String("[REDACTED]".to_string()));
                } else {
                    next.insert(key.clone(), redact_json_value(nested));
                }
            }
            Value::Object(next)
        }
        Value::Array(items) => Value::Array(items.iter().map(redact_json_value).collect()),
        Value::String(text) if looks_like_bearer_token(text) => {
            Value::String("[REDACTED]".to_string())
        }
        _ => value.clone(),
    }
}

pub fn summarize_json_value(value: &Value) -> String {
    let redacted = redact_json_value(value);
    let serialized = match redacted {
        Value::String(text) => text,
        other => serde_json::to_string(&other)
            .unwrap_or_else(|_| json!({"summary":"unserializable"}).to_string()),
    };

    let normalized = serialized.replace('\n', " ");
    if normalized.len() <= 240 {
        normalized
    } else {
        format!("{}...", &normalized[..240])
    }
}

fn is_sensitive_key(key: &str) -> bool {
    matches!(
        key.to_ascii_lowercase().as_str(),
        "authorization"
            | "api_key"
            | "apikey"
            | "client_secret"
            | "private_key"
            | "password"
            | "passwd"
            | "token"
            | "access_token"
            | "refresh_token"
            | "secret"
            | "cookie"
            | "set-cookie"
            | "session"
            | "session_token"
    )
}

fn looks_like_bearer_token(text: &str) -> bool {
    let lowercase = text.to_ascii_lowercase();
    lowercase.starts_with("bearer ")
        || lowercase.contains("sk-")
        || lowercase.contains("api-key")
        || lowercase.contains("ghp_")
        || lowercase.contains("xoxb-")
}

fn denied_approval_result(error: &ToolExecutionError) -> Option<String> {
    match error.code() {
        "approval_denied" => Some("denied".to_string()),
        "approval_expired" => Some("expired".to_string()),
        "approval_invalidated" => Some("invalidated".to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn redacts_sensitive_fields_and_tokens() {
        let redacted = redact_json_value(&json!({
            "authorization": "Bearer secret-token",
            "nested": {
                "password": "hidden",
                "client_secret": "secret",
                "deeper": {
                    "private_key": "pem",
                    "passwd": "hidden"
                },
                "note": "visible"
            },
            "tokenLike": "sk-test"
        }));

        assert_eq!(redacted["authorization"], "[REDACTED]");
        assert_eq!(redacted["nested"]["password"], "[REDACTED]");
        assert_eq!(redacted["nested"]["client_secret"], "[REDACTED]");
        assert_eq!(redacted["nested"]["deeper"]["private_key"], "[REDACTED]");
        assert_eq!(redacted["nested"]["deeper"]["passwd"], "[REDACTED]");
        assert_eq!(redacted["nested"]["note"], "visible");
        assert_eq!(redacted["tokenLike"], "[REDACTED]");
    }

    #[test]
    fn summarizes_large_values() {
        let summary = summarize_json_value(&json!({
            "content": "x".repeat(400)
        }));
        assert!(summary.len() <= 243);
        assert!(summary.ends_with("..."));
    }
}
