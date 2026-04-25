use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use futures_util::StreamExt;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::db;
use crate::error::AppError;
use crate::models::{
    ChatStreamRequest, Conversation, Message, StreamChunkEvent, StreamDoneEvent, StreamErrorEvent,
    StreamProviderEvent,
};

static STREAM_CANCEL_REGISTRY: OnceLock<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>> =
    OnceLock::new();

fn stream_cancel_registry() -> &'static Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>> {
    STREAM_CANCEL_REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Clone)]
struct ProviderConfig {
    provider: String,
    model: String,
    api_key: Option<String>,
    base_url: Option<String>,
    fallback_used: bool,
}

fn parse_provider_error(raw: &str) -> String {
    if raw.trim().is_empty() {
        return "Provider request failed".to_string();
    }

    if let Ok(json) = serde_json::from_str::<Value>(raw) {
        if let Some(openai_message) = json
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
        {
            return openai_message.to_string();
        }

        if let Some(anthropic_message) = json
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
        {
            return anthropic_message.to_string();
        }

        if let Some(ollama_message) = json.get("error").and_then(Value::as_str) {
            return ollama_message.to_string();
        }
    }

    raw.to_string()
}

fn emit_stream_error(app: &AppHandle, stream_id: &str, message: String) {
    let _ = app.emit(
        "chat-stream-error",
        StreamErrorEvent {
            stream_id: stream_id.to_string(),
            message,
        },
    );
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
                .filter(|model| !model.trim().is_empty())
                .unwrap_or_else(|| request.model.clone());

            let fallback_api_key = request
                .fallback_api_key
                .clone()
                .or_else(|| request.api_key.clone());

            let fallback_base_url = request
                .fallback_base_url
                .clone()
                .or_else(|| request.base_url.clone());

            let duplicate = providers
                .iter()
                .any(|config| config.provider == fallback_provider && config.model == fallback_model);

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

    if providers.is_empty() {
        return Err(AppError::Network("No providers configured".to_string()));
    }

    Ok(providers)
}

fn build_openai_request_body(request: &ChatStreamRequest, model: &str) -> Value {
    let mut json = serde_json::json!({
        "model": model,
        "stream": true,
        "messages": request.messages,
    });

    if let Some(temp) = request.temperature {
        json["temperature"] = serde_json::json!(temp);
    }

    if let Some(max_tokens) = request.max_tokens {
        json["max_tokens"] = serde_json::json!(max_tokens);
    }

    json
}

fn build_claude_request_body(request: &ChatStreamRequest, model: &str) -> Value {
    let mut json = serde_json::json!({
        "model": model,
        "stream": true,
        "messages": request.messages,
        "max_tokens": request.max_tokens.unwrap_or(1024),
    });

    if let Some(temp) = request.temperature {
        json["temperature"] = serde_json::json!(temp);
    }

    json
}

fn build_ollama_request_body(request: &ChatStreamRequest, model: &str) -> Value {
    let mut json = serde_json::json!({
        "model": model,
        "stream": true,
        "messages": request.messages,
    });

    if request.temperature.is_some() || request.max_tokens.is_some() {
        json["options"] = serde_json::json!({});
        if let Some(temp) = request.temperature {
            json["options"]["temperature"] = serde_json::json!(temp);
        }
        if let Some(max_tokens) = request.max_tokens {
            json["options"]["num_predict"] = serde_json::json!(max_tokens);
        }
    }

    json
}

async fn create_provider_response(
    request: &ChatStreamRequest,
    provider_config: &ProviderConfig,
) -> Result<reqwest::Response, AppError> {
    let client = reqwest::Client::new();

    match provider_config.provider.as_str() {
        "openai" => {
            let api_key = provider_config
                .api_key
                .as_ref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| AppError::Network("Missing OpenAI API key".to_string()))?;

            let url = provider_config
                .base_url
                .clone()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "https://api.openai.com/v1/chat/completions".to_string());

            let response = client
                .post(url)
                .header("Authorization", format!("Bearer {}", api_key.trim()))
                .header("Content-Type", "application/json")
                .json(&build_openai_request_body(request, &provider_config.model))
                .send()
                .await?;

            Ok(response)
        }
        "claude" => {
            let api_key = provider_config
                .api_key
                .as_ref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| AppError::Network("Missing Claude API key".to_string()))?;

            let url = provider_config
                .base_url
                .clone()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "https://api.anthropic.com/v1/messages".to_string());

            let response = client
                .post(url)
                .header("x-api-key", api_key.trim())
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
                .json(&build_claude_request_body(request, &provider_config.model))
                .send()
                .await?;

            Ok(response)
        }
        "ollama" => {
            let base_url = provider_config
                .base_url
                .clone()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "http://127.0.0.1:11434".to_string());
            let url = format!("{}/api/chat", base_url.trim_end_matches('/'));

            let response = client
                .post(url)
                .header("Content-Type", "application/json")
                .json(&build_ollama_request_body(request, &provider_config.model))
                .send()
                .await?;

            Ok(response)
        }
        _ => Err(AppError::Network(format!(
            "Unsupported provider: {}",
            provider_config.provider
        ))),
    }
}

fn extract_provider_token(provider: &str, payload: &str) -> Option<String> {
    let json = serde_json::from_str::<Value>(payload).ok()?;

    match provider {
        "openai" => json
            .get("choices")
            .and_then(Value::as_array)
            .and_then(|choices| choices.first())
            .and_then(|choice| choice.get("delta"))
            .and_then(|delta| delta.get("content"))
            .and_then(Value::as_str)
            .map(ToString::to_string),
        "claude" => {
            let event_type = json.get("type").and_then(Value::as_str).unwrap_or_default();
            if event_type != "content_block_delta" {
                return None;
            }
            json.get("delta")
                .and_then(|delta| delta.get("text"))
                .and_then(Value::as_str)
                .map(ToString::to_string)
        }
        "ollama" => json
            .get("message")
            .and_then(|message| message.get("content"))
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string),
        _ => None,
    }
}

fn is_done_payload(provider: &str, payload: &str) -> bool {
    if payload == "[DONE]" {
        return true;
    }

    if provider == "ollama" {
        if let Ok(json) = serde_json::from_str::<Value>(payload) {
            return json.get("done").and_then(Value::as_bool).unwrap_or(false);
        }
    }

    false
}

async fn stream_from_provider(
    app: &AppHandle,
    request: &ChatStreamRequest,
    provider_config: &ProviderConfig,
    cancel_rx: &mut tokio::sync::oneshot::Receiver<()>,
) -> Result<(), AppError> {
    emit_provider_event(app, &request.stream_id, provider_config);

    let response = create_provider_response(request, provider_config).await?;
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Provider request failed".to_string());
        return Err(AppError::Network(parse_provider_error(&error_text)));
    }

    let mut byte_stream = response.bytes_stream();
    let mut buffer = String::new();

    loop {
        tokio::select! {
            _ = &mut *cancel_rx => {
                return Ok(());
            }
            next_chunk = byte_stream.next() => {
                match next_chunk {
                    Some(Ok(bytes)) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));
                        let lines = buffer.split('\n').map(str::to_string).collect::<Vec<_>>();
                        buffer = lines.last().cloned().unwrap_or_default();

                        for line in lines.iter().take(lines.len().saturating_sub(1)) {
                            let trimmed = line.trim();
                            if trimmed.is_empty() {
                                continue;
                            }

                            let payload = if provider_config.provider == "ollama" {
                                trimmed
                            } else if trimmed.starts_with("data:") {
                                trimmed.trim_start_matches("data:").trim()
                            } else {
                                continue;
                            };

                            if is_done_payload(&provider_config.provider, payload) {
                                return Ok(());
                            }

                            if let Some(token) = extract_provider_token(&provider_config.provider, payload) {
                                let _ = app.emit(
                                    "chat-stream-chunk",
                                    StreamChunkEvent {
                                        stream_id: request.stream_id.clone(),
                                        token,
                                    },
                                );
                            }
                        }
                    }
                    Some(Err(error)) => {
                        return Err(AppError::Network(error.to_string()));
                    }
                    None => {
                        return Ok(());
                    }
                }
            }
        }
    }
}

async fn run_stream_with_fallback(app: AppHandle, request: ChatStreamRequest) -> Result<(), AppError> {
    let providers = resolve_provider_configs(&request)?;
    let mut last_error: Option<AppError> = None;

    let mut cancel_rx = {
        let mut registry = stream_cancel_registry()
            .lock()
            .map_err(|err| AppError::Network(err.to_string()))?;

        if let Some(previous_cancel) = registry.remove(&request.stream_id) {
            let _ = previous_cancel.send(());
        }

        let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel();
        registry.insert(request.stream_id.clone(), cancel_tx);
        cancel_rx
    };

    for provider in providers {
        match stream_from_provider(&app, &request, &provider, &mut cancel_rx).await {
            Ok(()) => {
                let _ = app.emit(
                    "chat-stream-done",
                    StreamDoneEvent {
                        stream_id: request.stream_id.clone(),
                    },
                );
                return Ok(());
            }
            Err(error) => {
                last_error = Some(error);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| AppError::Network("All providers failed".to_string())))
}

#[tauri::command]
pub fn save_conversation(app: AppHandle, conversation: Conversation) -> Result<(), String> {
    db::save_conversation(&app, conversation).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn save_message(app: AppHandle, message: Message) -> Result<(), String> {
    db::save_message(&app, message).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_conversations(app: AppHandle) -> Result<Vec<Conversation>, String> {
    db::list_conversations(&app).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_messages(app: AppHandle, conversation_id: String) -> Result<Vec<Message>, String> {
    db::list_messages(&app, conversation_id).map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn stream_chat(app: AppHandle, request: ChatStreamRequest) -> Result<(), String> {
    if request.provider.trim().is_empty() {
        return Err("Missing provider".to_string());
    }

    if request.messages.is_empty() {
        return Err("No messages provided".to_string());
    }

    if request.model.trim().is_empty() {
        return Err("Missing model".to_string());
    }

    let app_for_stream = app.clone();
    let stream_id = request.stream_id.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_stream_with_fallback(app_for_stream.clone(), request).await {
            emit_stream_error(&app_for_stream, &stream_id, error.to_string());
            let _ = app_for_stream.emit(
                "chat-stream-done",
                StreamDoneEvent {
                    stream_id: stream_id.clone(),
                },
            );
        }

        if let Ok(mut registry) = stream_cancel_registry().lock() {
            registry.remove(&stream_id);
        }
    });

    Ok(())
}

#[tauri::command]
pub fn cancel_chat_stream(stream_id: String) -> Result<(), String> {
    let mut registry = stream_cancel_registry()
        .lock()
        .map_err(|err| err.to_string())?;

    if let Some(cancel_tx) = registry.remove(&stream_id) {
        let _ = cancel_tx.send(());
    }

    Ok(())
}
