pub mod cancellation;
mod provider;

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use jarvis_core::error::AppError;
use jarvis_core::models::{
    ChatInputMessage, ChatStreamRequest, StreamChunkEvent, StreamProviderEvent,
};

use crate::agent::cancellation::StreamCancellationToken;
use crate::mcp::authorization::{build_action_context, RequestAuthority, RequestOrigin};
use crate::mcp::{self, McpSystemState, ToolExecutionRequest};

const MAX_TOOL_ITERATIONS: usize = 8;
const MAX_TOOL_RESULT_CHARS: usize = 12_000;
const STREAM_CHUNK_SIZE: usize = 48;

#[derive(Clone)]
struct ProviderConfig {
    provider: String,
    model: String,
    api_key: Option<String>,
    base_url: Option<String>,
    fallback_used: bool,
}

#[derive(Debug, Clone)]
struct ToolDefinition {
    exposed_name: String,
    server_name: String,
    tool_name: String,
    description: Option<String>,
    input_schema: Value,
    annotations: Option<Value>,
    metadata: Option<Value>,
}

#[derive(Debug, Clone)]
enum AgentMessage {
    System(String),
    User(String),
    Assistant {
        content: Option<String>,
        tool_calls: Vec<ToolCall>,
    },
    Tool {
        tool_call_id: String,
        tool_name: String,
        content: String,
        is_error: bool,
    },
}

#[derive(Debug, Clone)]
struct ToolCall {
    id: String,
    name: String,
    arguments: Value,
}

#[derive(Debug, Clone)]
struct AssistantTurn {
    content: Option<String>,
    tool_calls: Vec<ToolCall>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentToolEvent {
    stream_id: String,
    server_name: String,
    tool_name: String,
    summary: Option<String>,
    duration_ms: Option<u128>,
    permission_decision: Option<String>,
    permission_level: Option<String>,
}

pub async fn should_use_agent_loop(app_handle: &AppHandle, request: &ChatStreamRequest) -> bool {
    let state = app_handle.state::<McpSystemState>();
    let active_tools = mcp::active_tool_count(&state).await;
    active_tools > 0 && provider::supports_tools(&request.provider)
}

pub async fn run_tool_loop_stream(
    app_handle: AppHandle,
    request: ChatStreamRequest,
    cancellation: StreamCancellationToken,
) -> Result<(), AppError> {
    let providers = resolve_provider_configs(&request)?;
    let state = app_handle.state::<McpSystemState>();
    let tools = build_tool_definitions(&state).await;
    let tool_map = tools
        .iter()
        .cloned()
        .map(|tool| (tool.exposed_name.clone(), tool))
        .collect::<HashMap<_, _>>();

    if tool_map.is_empty() {
        return Err(AppError::InvalidInput(
            "No MCP tools are active for the agent loop".to_string(),
        ));
    }

    let base_messages = request
        .messages
        .iter()
        .map(message_to_agent_message)
        .collect::<Vec<_>>();

    let mut last_error: Option<AppError> = None;
    for provider in providers {
        emit_provider_event(&app_handle, &request.stream_id, &provider);
        match run_with_provider(
            &app_handle,
            &request,
            &provider,
            &tools,
            &tool_map,
            &base_messages,
            cancellation.child_token(),
        )
        .await
        {
            Ok(()) => return Ok(()),
            Err(error) => last_error = Some(error),
        }
    }

    Err(last_error.unwrap_or_else(|| AppError::Network("All providers failed".to_string())))
}

fn resolve_provider_configs(request: &ChatStreamRequest) -> Result<Vec<ProviderConfig>, AppError> {
    let mut providers = Vec::new();

    providers.push(ProviderConfig {
        provider: request.provider.clone(),
        model: request.model.clone(),
        api_key: request.api_key.clone(),
        base_url: request.base_url.clone(),
        fallback_used: false,
    });

    if let Some(fallback_provider) = request.fallback_provider.clone() {
        if fallback_provider != "none" {
            let fallback_model = request
                .fallback_model
                .clone()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| request.model.clone());

            let fallback_api_key = request
                .fallback_api_key
                .clone()
                .or_else(|| request.api_key.clone());

            let fallback_base_url = request
                .fallback_base_url
                .clone()
                .or_else(|| request.base_url.clone());

            let duplicate = providers.iter().any(|config| {
                config.provider == fallback_provider && config.model == fallback_model
            });

            if !duplicate {
                providers.push(ProviderConfig {
                    provider: fallback_provider,
                    model: fallback_model,
                    api_key: fallback_api_key,
                    base_url: fallback_base_url,
                    fallback_used: true,
                });
            }
        }
    }

    Ok(providers)
}

async fn build_tool_definitions(state: &McpSystemState) -> Vec<ToolDefinition> {
    mcp::collect_active_tools(state)
        .await
        .into_iter()
        .map(|(server_name, tool)| ToolDefinition {
            exposed_name: build_tool_alias(&server_name, &tool.name),
            server_name,
            tool_name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema,
            annotations: tool.annotations,
            metadata: tool.metadata,
        })
        .collect()
}

fn build_tool_alias(server_name: &str, tool_name: &str) -> String {
    let server = slug(server_name, 18);
    let tool = slug(tool_name, 18);
    let hash = fnv1a(format!("{}::{}", server_name, tool_name).as_bytes());
    format!("mcp_{}_{}_{}", server, tool, hash)
}

fn slug(value: &str, max_len: usize) -> String {
    let mut out = String::new();
    for ch in value.chars() {
        let normalized = if ch.is_ascii_alphanumeric() {
            ch.to_ascii_lowercase()
        } else {
            '_'
        };
        if out.chars().last() == Some('_') && normalized == '_' {
            continue;
        }
        out.push(normalized);
        if out.len() >= max_len {
            break;
        }
    }

    out.trim_matches('_').to_string()
}

fn fnv1a(bytes: &[u8]) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in bytes {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:08x}", hash as u32)
}

fn message_to_agent_message(message: &ChatInputMessage) -> AgentMessage {
    match message.role.as_str() {
        "system" => AgentMessage::System(message.content.clone()),
        "assistant" => AgentMessage::Assistant {
            content: Some(message.content.clone()),
            tool_calls: Vec::new(),
        },
        _ => AgentMessage::User(message.content.clone()),
    }
}

async fn run_with_provider(
    app_handle: &AppHandle,
    request: &ChatStreamRequest,
    provider: &ProviderConfig,
    tools: &[ToolDefinition],
    tool_map: &HashMap<String, ToolDefinition>,
    base_messages: &[AgentMessage],
    cancellation: StreamCancellationToken,
) -> Result<(), AppError> {
    let mut messages = base_messages.to_vec();
    let mut seen_calls = HashSet::new();

    for _ in 0..MAX_TOOL_ITERATIONS {
        if cancellation.is_cancelled() {
            return Err(AppError::Cancelled);
        }

        let turn = provider::complete(
            provider,
            request,
            &messages,
            tools,
            cancellation.child_token(),
        )
        .await?;
        if turn.tool_calls.is_empty() {
            let final_text = turn
                .content
                .clone()
                .filter(|content| !content.trim().is_empty())
                .ok_or_else(|| AppError::Network("Provider returned no content".to_string()))?;
            stream_text(app_handle, &request.stream_id, &final_text).await;
            return Ok(());
        }

        messages.push(AgentMessage::Assistant {
            content: turn.content.clone(),
            tool_calls: turn.tool_calls.clone(),
        });

        for tool_call in turn.tool_calls {
            let Some(tool_definition) = tool_map.get(&tool_call.name).cloned() else {
                let error = json!({
                    "ok": false,
                    "code": "tool_not_found",
                    "message": format!("Tool '{}' is not registered in the current MCP registry", tool_call.name),
                });
                append_tool_result(
                    &mut messages,
                    &tool_call,
                    truncate_for_model(&error.to_string()),
                    true,
                );
                emit_tool_error(
                    app_handle,
                    &request.stream_id,
                    "unknown".to_string(),
                    tool_call.name.clone(),
                    Some("Tool not found".to_string()),
                    None,
                    None,
                );
                continue;
            };

            let fingerprint = format!(
                "{}:{}",
                tool_call.name,
                canonical_json(&tool_call.arguments)
            );
            if !seen_calls.insert(fingerprint) {
                let error = json!({
                    "ok": false,
                    "code": "duplicate_tool_call",
                    "message": "Repeated identical tool call blocked",
                });
                append_tool_result(
                    &mut messages,
                    &tool_call,
                    truncate_for_model(&error.to_string()),
                    true,
                );
                emit_tool_error(
                    app_handle,
                    &request.stream_id,
                    tool_definition.server_name.clone(),
                    tool_definition.tool_name.clone(),
                    Some("Repeated identical tool call blocked".to_string()),
                    None,
                    None,
                );
                continue;
            }

            emit_tool_start(
                app_handle,
                &request.stream_id,
                &tool_definition.server_name,
                &tool_definition.tool_name,
            );

            match mcp::execute_tool(
                app_handle,
                ToolExecutionRequest {
                    server_name: tool_definition.server_name.clone(),
                    tool_name: tool_definition.tool_name.clone(),
                    arguments: tool_call.arguments.clone(),
                    stream_id: Some(request.stream_id.clone()),
                    approval_id: None,
                    tool_alias: Some(tool_call.name.clone()),
                    tool_description: tool_definition.description.clone(),
                    action_context: build_action_context(
                        &tool_definition.server_name,
                        &mcp::McpTool {
                            name: tool_definition.tool_name.clone(),
                            description: tool_definition.description.clone(),
                            input_schema: tool_definition.input_schema.clone(),
                            annotations: tool_definition.annotations.clone(),
                            metadata: tool_definition.metadata.clone(),
                        },
                        Some(tool_call.name.clone()),
                        RequestOrigin::DirectUser,
                        RequestAuthority::DirectUserInstruction,
                    ),
                },
                Some(cancellation.child_token()),
            )
            .await
            {
                Ok(outcome) => {
                    append_tool_result(
                        &mut messages,
                        &tool_call,
                        tool_result_to_model_text(&outcome.result),
                        outcome.is_error,
                    );
                    emit_tool_result(
                        app_handle,
                        &request.stream_id,
                        &outcome.server_name,
                        &outcome.tool_name,
                        &outcome.result_summary,
                        outcome.duration_ms,
                        Some(format!("{:?}", outcome.authorization.decision)),
                    );
                }
                Err(error) => {
                    if matches!(error.kind, mcp::ToolExecutionErrorKind::Cancelled) {
                        return Err(AppError::Cancelled);
                    }
                    let structured = mcp::structured_tool_error(&error);
                    append_tool_result(
                        &mut messages,
                        &tool_call,
                        tool_result_to_model_text(&structured),
                        true,
                    );
                    emit_tool_error(
                        app_handle,
                        &request.stream_id,
                        tool_definition.server_name.clone(),
                        tool_definition.tool_name.clone(),
                        Some(error.message.clone()),
                        error
                            .permission
                            .as_ref()
                            .map(|permission| format!("{:?}", permission.decision)),
                        error
                            .permission
                            .as_ref()
                            .map(|permission| format!("{:?}", permission.level)),
                    );
                }
            }
        }
    }

    Err(AppError::Network(format!(
        "Agent reached the tool iteration limit ({})",
        MAX_TOOL_ITERATIONS
    )))
}

fn append_tool_result(
    messages: &mut Vec<AgentMessage>,
    tool_call: &ToolCall,
    content: String,
    is_error: bool,
) {
    messages.push(AgentMessage::Tool {
        tool_call_id: tool_call.id.clone(),
        tool_name: tool_call.name.clone(),
        content,
        is_error,
    });
}

fn canonical_json(value: &Value) -> String {
    match value {
        Value::Object(map) => {
            let mut keys = map.keys().cloned().collect::<Vec<_>>();
            keys.sort();
            let items = keys
                .into_iter()
                .map(|key| {
                    let nested = canonical_json(map.get(&key).unwrap_or(&Value::Null));
                    format!("\"{}\":{}", key, nested)
                })
                .collect::<Vec<_>>();
            format!("{{{}}}", items.join(","))
        }
        Value::Array(items) => {
            let nested = items.iter().map(canonical_json).collect::<Vec<_>>();
            format!("[{}]", nested.join(","))
        }
        _ => serde_json::to_string(value).unwrap_or_else(|_| "null".to_string()),
    }
}

fn tool_result_to_model_text(value: &Value) -> String {
    truncate_for_model(&mcp::redacted_arguments(value).to_string())
}

fn truncate_for_model(value: &str) -> String {
    if value.len() <= MAX_TOOL_RESULT_CHARS {
        value.to_string()
    } else {
        format!(
            "{}...[truncated {} chars]",
            &value[..MAX_TOOL_RESULT_CHARS],
            value.len() - MAX_TOOL_RESULT_CHARS
        )
    }
}

fn emit_provider_event(app: &AppHandle, stream_id: &str, config: &ProviderConfig) {
    let _ = app.emit(
        "chat-stream-provider",
        StreamProviderEvent {
            stream_id: stream_id.to_string(),
            provider: config.provider.clone(),
            model: config.model.clone(),
            fallback_used: config.fallback_used,
        },
    );
}

fn emit_tool_start(app: &AppHandle, stream_id: &str, server_name: &str, tool_name: &str) {
    let _ = app.emit(
        "agent-tool-start",
        AgentToolEvent {
            stream_id: stream_id.to_string(),
            server_name: server_name.to_string(),
            tool_name: tool_name.to_string(),
            summary: None,
            duration_ms: None,
            permission_decision: None,
            permission_level: None,
        },
    );
}

fn emit_tool_result(
    app: &AppHandle,
    stream_id: &str,
    server_name: &str,
    tool_name: &str,
    summary: &str,
    duration_ms: u128,
    permission_decision: Option<String>,
) {
    let _ = app.emit(
        "agent-tool-result",
        AgentToolEvent {
            stream_id: stream_id.to_string(),
            server_name: server_name.to_string(),
            tool_name: tool_name.to_string(),
            summary: Some(summary.to_string()),
            duration_ms: Some(duration_ms),
            permission_decision,
            permission_level: None,
        },
    );
}

fn emit_tool_error(
    app: &AppHandle,
    stream_id: &str,
    server_name: String,
    tool_name: String,
    summary: Option<String>,
    permission_decision: Option<String>,
    permission_level: Option<String>,
) {
    let _ = app.emit(
        "agent-tool-error",
        AgentToolEvent {
            stream_id: stream_id.to_string(),
            server_name,
            tool_name,
            summary,
            duration_ms: None,
            permission_decision,
            permission_level,
        },
    );
}

async fn stream_text(app_handle: &AppHandle, stream_id: &str, content: &str) {
    if content.is_empty() {
        return;
    }

    for chunk in content.as_bytes().chunks(STREAM_CHUNK_SIZE) {
        let token = String::from_utf8_lossy(chunk).to_string();
        let _ = app_handle.emit(
            "chat-stream-chunk",
            StreamChunkEvent {
                stream_id: stream_id.to_string(),
                token,
            },
        );
        tokio::task::yield_now().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn duplicate_tool_names_across_servers_get_unique_aliases() {
        let left = build_tool_alias("weather-a", "lookup");
        let right = build_tool_alias("weather-b", "lookup");
        assert_ne!(left, right);
        assert!(left.starts_with("mcp_"));
        assert!(right.starts_with("mcp_"));
    }

    #[test]
    fn tool_results_are_truncated_for_model_context() {
        let output = tool_result_to_model_text(&json!({
            "content": "x".repeat(MAX_TOOL_RESULT_CHARS + 200)
        }));
        assert!(output.contains("[truncated"));
    }
}
