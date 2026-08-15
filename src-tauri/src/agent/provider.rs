use serde_json::{json, Value};

use jarvis_core::error::AppError;
use jarvis_core::models::ChatStreamRequest;

use crate::agent::cancellation::StreamCancellationToken;

use super::{AgentMessage, AssistantTurn, ProviderConfig, ToolCall, ToolDefinition};

pub fn supports_tools(provider: &str) -> bool {
    matches!(
        provider,
        "openai" | "claude" | "ollama" | "groq" | "together"
    )
}

pub async fn complete(
    provider: &ProviderConfig,
    request: &ChatStreamRequest,
    messages: &[AgentMessage],
    tools: &[ToolDefinition],
    cancellation: StreamCancellationToken,
) -> Result<AssistantTurn, AppError> {
    match provider.provider.as_str() {
        "claude" => complete_claude(provider, request, messages, tools, cancellation).await,
        "openai" | "ollama" | "groq" | "together" => {
            complete_openai_compatible(provider, request, messages, tools, cancellation).await
        }
        _ => Err(AppError::InvalidInput(format!(
            "Provider '{}' does not support tool calling",
            provider.provider
        ))),
    }
}

async fn complete_openai_compatible(
    provider: &ProviderConfig,
    request: &ChatStreamRequest,
    messages: &[AgentMessage],
    tools: &[ToolDefinition],
    cancellation: StreamCancellationToken,
) -> Result<AssistantTurn, AppError> {
    let url = openai_compatible_chat_url(provider);
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|error| AppError::Network(error.to_string()))?;

    let payload = build_openai_payload(provider, request, messages, tools);
    let mut request_builder = client.post(url).header("Content-Type", "application/json");
    if provider.provider != "ollama" {
        let api_key = provider
            .api_key
            .as_ref()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                AppError::InvalidInput(format!("Missing API key for {}", provider.provider))
            })?;
        request_builder =
            request_builder.header("Authorization", format!("Bearer {}", api_key.trim()));
    }

    let mut cancel_wait = cancellation.child_token();
    let response = tokio::select! {
        response = request_builder.json(&payload).send() => response?,
        _ = cancel_wait.cancelled() => return Err(AppError::Cancelled),
    };
    let status = response.status();
    let raw = response
        .text()
        .await
        .map_err(|error| AppError::Network(error.to_string()))?;
    if !status.is_success() {
        return Err(AppError::Network(parse_provider_error(&raw)));
    }

    let value: Value = serde_json::from_str(&raw).map_err(|error| {
        AppError::Serialization(format!(
            "Failed to parse {} response: {}",
            provider.provider, error
        ))
    })?;

    let message = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .ok_or_else(|| {
            AppError::Serialization("Provider response is missing choices[0].message".to_string())
        })?;

    let content = message.get("content").and_then(|content| match content {
        Value::String(text) => Some(text.clone()),
        Value::Array(items) => Some(
            items
                .iter()
                .filter_map(|item| item.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n"),
        ),
        _ => None,
    });

    let tool_calls = message
        .get("tool_calls")
        .and_then(Value::as_array)
        .map(|tool_calls| parse_openai_tool_calls(tool_calls))
        .transpose()?
        .unwrap_or_default();

    Ok(AssistantTurn {
        content,
        tool_calls,
    })
}

fn build_openai_payload(
    provider: &ProviderConfig,
    request: &ChatStreamRequest,
    messages: &[AgentMessage],
    tools: &[ToolDefinition],
) -> Value {
    let mut payload = json!({
        "model": provider.model,
        "stream": false,
        "messages": openai_messages(messages),
        "tools": openai_tools(tools),
        "tool_choice": "auto",
    });

    if let Some(temperature) = request.temperature {
        payload["temperature"] = json!(temperature);
    }
    if let Some(max_tokens) = request.max_tokens {
        payload["max_tokens"] = json!(max_tokens);
    }

    payload
}

fn openai_messages(messages: &[AgentMessage]) -> Vec<Value> {
    messages
        .iter()
        .map(|message| match message {
            AgentMessage::System(content) => json!({
                "role": "system",
                "content": content,
            }),
            AgentMessage::User(content) => json!({
                "role": "user",
                "content": content,
            }),
            AgentMessage::Assistant {
                content,
                tool_calls,
            } if tool_calls.is_empty() => json!({
                "role": "assistant",
                "content": content.clone().unwrap_or_default(),
            }),
            AgentMessage::Assistant {
                content,
                tool_calls,
            } => json!({
                "role": "assistant",
                "content": content.clone().unwrap_or_default(),
                "tool_calls": tool_calls
                    .iter()
                    .map(|tool_call| {
                        json!({
                            "id": tool_call.id,
                            "type": "function",
                            "function": {
                                "name": tool_call.name,
                                "arguments": canonical_json(&tool_call.arguments),
                            }
                        })
                    })
                    .collect::<Vec<_>>(),
            }),
            AgentMessage::Tool {
                tool_call_id,
                tool_name,
                content,
                ..
            } => json!({
                "role": "tool",
                "tool_call_id": tool_call_id,
                "name": tool_name,
                "content": content,
            }),
        })
        .collect()
}

fn openai_tools(tools: &[ToolDefinition]) -> Vec<Value> {
    tools
        .iter()
        .map(|tool| {
            json!({
                "type": "function",
                "function": {
                    "name": tool.exposed_name,
                    "description": tool.description.clone().unwrap_or_default(),
                    "parameters": tool.input_schema,
                }
            })
        })
        .collect()
}

fn parse_openai_tool_calls(tool_calls: &[Value]) -> Result<Vec<ToolCall>, AppError> {
    let mut parsed = Vec::new();
    for tool_call in tool_calls {
        let id = tool_call
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Serialization("Tool call is missing id".to_string()))?;
        let function = tool_call
            .get("function")
            .ok_or_else(|| AppError::Serialization("Tool call is missing function".to_string()))?;
        let name = function
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                AppError::Serialization("Tool call is missing function.name".to_string())
            })?;
        let arguments = function
            .get("arguments")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                AppError::Serialization("Tool call is missing function.arguments".to_string())
            })?;
        let parsed_arguments = serde_json::from_str::<Value>(arguments).map_err(|error| {
            AppError::Serialization(format!("Invalid tool arguments JSON: {}", error))
        })?;

        parsed.push(ToolCall {
            id: id.to_string(),
            name: name.to_string(),
            arguments: parsed_arguments,
        });
    }
    Ok(parsed)
}

async fn complete_claude(
    provider: &ProviderConfig,
    request: &ChatStreamRequest,
    messages: &[AgentMessage],
    tools: &[ToolDefinition],
    cancellation: StreamCancellationToken,
) -> Result<AssistantTurn, AppError> {
    let api_key = provider
        .api_key
        .as_ref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::InvalidInput("Missing Claude API key".to_string()))?;

    let url = provider
        .base_url
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "https://api.anthropic.com/v1/messages".to_string());
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|error| AppError::Network(error.to_string()))?;

    let payload = build_claude_payload(provider, request, messages, tools);
    let mut cancel_wait = cancellation.child_token();
    let response = tokio::select! {
        response = client
            .post(url)
            .header("x-api-key", api_key.trim())
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&payload)
            .send() => response?,
        _ = cancel_wait.cancelled() => return Err(AppError::Cancelled),
    };

    let status = response.status();
    let raw = response
        .text()
        .await
        .map_err(|error| AppError::Network(error.to_string()))?;
    if !status.is_success() {
        return Err(AppError::Network(parse_provider_error(&raw)));
    }

    let value: Value = serde_json::from_str(&raw).map_err(|error| {
        AppError::Serialization(format!("Failed to parse Claude response: {}", error))
    })?;
    let blocks = value
        .get("content")
        .and_then(Value::as_array)
        .ok_or_else(|| AppError::Serialization("Claude response is missing content".to_string()))?;

    let mut content_fragments = Vec::new();
    let mut tool_calls = Vec::new();

    for block in blocks {
        match block.get("type").and_then(Value::as_str) {
            Some("text") => {
                if let Some(text) = block.get("text").and_then(Value::as_str) {
                    content_fragments.push(text.to_string());
                }
            }
            Some("tool_use") => {
                let id = block.get("id").and_then(Value::as_str).ok_or_else(|| {
                    AppError::Serialization("Claude tool_use block missing id".to_string())
                })?;
                let name = block.get("name").and_then(Value::as_str).ok_or_else(|| {
                    AppError::Serialization("Claude tool_use block missing name".to_string())
                })?;
                let input = block.get("input").cloned().ok_or_else(|| {
                    AppError::Serialization("Claude tool_use block missing input".to_string())
                })?;

                tool_calls.push(ToolCall {
                    id: id.to_string(),
                    name: name.to_string(),
                    arguments: input,
                });
            }
            _ => {}
        }
    }

    let content = if content_fragments.is_empty() {
        None
    } else {
        Some(content_fragments.join("\n"))
    };

    Ok(AssistantTurn {
        content,
        tool_calls,
    })
}

fn build_claude_payload(
    provider: &ProviderConfig,
    request: &ChatStreamRequest,
    messages: &[AgentMessage],
    tools: &[ToolDefinition],
) -> Value {
    let system = messages
        .iter()
        .filter_map(|message| match message {
            AgentMessage::System(content) => Some(content.clone()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    let mut payload = json!({
        "model": provider.model,
        "messages": claude_messages(messages),
        "tools": claude_tools(tools),
        "max_tokens": request.max_tokens.unwrap_or(1024),
    });

    if !system.trim().is_empty() {
        payload["system"] = json!(system);
    }
    if let Some(temperature) = request.temperature {
        payload["temperature"] = json!(temperature);
    }

    payload
}

fn claude_messages(messages: &[AgentMessage]) -> Vec<Value> {
    messages
        .iter()
        .filter_map(|message| match message {
            AgentMessage::System(_) => None,
            AgentMessage::User(content) => Some(json!({
                "role": "user",
                "content": content,
            })),
            AgentMessage::Assistant {
                content,
                tool_calls,
            } if tool_calls.is_empty() => Some(json!({
                "role": "assistant",
                "content": content.clone().unwrap_or_default(),
            })),
            AgentMessage::Assistant {
                content,
                tool_calls,
            } => {
                let mut blocks = Vec::new();
                if let Some(content) = content.clone().filter(|value| !value.trim().is_empty()) {
                    blocks.push(json!({
                        "type": "text",
                        "text": content,
                    }));
                }
                for tool_call in tool_calls {
                    blocks.push(json!({
                        "type": "tool_use",
                        "id": tool_call.id,
                        "name": tool_call.name,
                        "input": tool_call.arguments,
                    }));
                }
                Some(json!({
                    "role": "assistant",
                    "content": blocks,
                }))
            }
            AgentMessage::Tool {
                tool_call_id,
                content,
                is_error,
                ..
            } => Some(json!({
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": tool_call_id,
                        "content": content,
                        "is_error": is_error,
                    }
                ]
            })),
        })
        .collect()
}

fn claude_tools(tools: &[ToolDefinition]) -> Vec<Value> {
    tools
        .iter()
        .map(|tool| {
            json!({
                "name": tool.exposed_name,
                "description": tool.description.clone().unwrap_or_default(),
                "input_schema": tool.input_schema,
            })
        })
        .collect()
}

fn openai_compatible_chat_url(provider: &ProviderConfig) -> String {
    match provider.provider.as_str() {
        "openai" => provider
            .base_url
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "https://api.openai.com/v1/chat/completions".to_string()),
        "groq" | "together" => provider
            .base_url
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "https://api.openai.com/v1/chat/completions".to_string()),
        "ollama" => {
            let base = provider
                .base_url
                .clone()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "http://127.0.0.1:11434".to_string());

            if base.ends_with("/chat/completions") {
                base
            } else if base.ends_with("/v1") {
                format!("{}/chat/completions", base.trim_end_matches('/'))
            } else {
                format!("{}/v1/chat/completions", base.trim_end_matches('/'))
            }
        }
        _ => provider
            .base_url
            .clone()
            .unwrap_or_else(|| "https://api.openai.com/v1/chat/completions".to_string()),
    }
}

fn parse_provider_error(raw: &str) -> String {
    if raw.trim().is_empty() {
        return "Provider request failed".to_string();
    }

    if let Ok(json) = serde_json::from_str::<Value>(raw) {
        if let Some(message) = json
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
        {
            return message.to_string();
        }

        if let Some(message) = json.get("error").and_then(Value::as_str) {
            return message.to_string();
        }
    }

    raw.to_string()
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
