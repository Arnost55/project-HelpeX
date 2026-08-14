use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use base64::Engine;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use jarvis_core::db;
use jarvis_core::error::AppError;
use jarvis_core::models::{
    ChatStreamRequest, Conversation, Message, ProviderHealthResponse, ProviderRequest,
    UserProfile,
    StreamChunkEvent, StreamDoneEvent, StreamErrorEvent, StreamProviderEvent,
};

use crate::agent;

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
        if let Some(message) = json
            .get("error")
            .and_then(|e| e.get("message"))
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

fn provider_display_name(provider: &str) -> &str {
    match provider {
        "openai" => "OpenAI",
        "claude" => "Claude",
        "ollama" => "Ollama",
        "groq" => "Groq",
        "together" => "Together",
        _ => provider,
    }
}

fn model_list_url_from_chat_url(url: &str) -> String {
    if let Some(prefix) = url.strip_suffix("/chat/completions") {
        return format!("{}/models", prefix);
    }
    if let Some(prefix) = url.strip_suffix("/completions") {
        return format!("{}/models", prefix);
    }
    if let Some(prefix) = url.strip_suffix("/") {
        return format!("{}/models", prefix);
    }
    format!("{}/models", url)
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
                .filter(|m| !m.trim().is_empty())
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
                .any(|c| c.provider == fallback_provider && c.model == fallback_model);

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

    eprintln!("[OLLAMA_BODY] stream=true model={} messages={}",
        model, request.messages.len());
    json
}

/// Non-streaming one-shot call to Ollama /api/chat.
/// Always sets "stream": false, reads raw text first, logs heavily on parse failure.
async fn call_ollama_raw_sync(
    client: &reqwest::Client,
    url: &str,
    body: Value,
) -> Result<Value, String> {
    eprintln!("[OLLAMA_SYNC] POST {} | body keys: {:?} | stream=false",
        url,
        body.as_object().map(|o| o.keys().cloned().collect::<Vec<_>>()));

    let response = client
        .post(url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            eprintln!("[OLLAMA_SYNC] NETWORK ERROR: {e}");
            format!("Ollama network error: {e}")
        })?;

    let http_status = response.status();
    eprintln!("[OLLAMA_SYNC] HTTP status: {http_status}");

    let raw_text = response.text().await.map_err(|e| {
        eprintln!("[OLLAMA_SYNC] FAILED TO READ BODY: {e}");
        format!("Ollama body read error: {e}")
    })?;

    eprintln!("[OLLAMA_SYNC] Raw body ({len} chars):\n---\n{preview}\n---",
        len = raw_text.len(),
        preview = if raw_text.len() > 2000 {
            format!("{}...", &raw_text[..2000])
        } else {
            raw_text.clone()
        }
    );

    if !http_status.is_success() {
        let err = parse_provider_error(&raw_text);
        eprintln!("[OLLAMA_SYNC] NON-200: {err}");
        return Err(format!("HTTP {http_status}: {err}"));
    }

    let json: Value = serde_json::from_str(&raw_text).map_err(|e| {
        eprintln!("[OLLAMA_SYNC] *** JSON PARSE FAILED ***: {e}");
        eprintln!("[OLLAMA_SYNC] --- BEGIN RAW ({len} bytes) ---", len = raw_text.len());
        eprintln!("{raw_text}");
        eprintln!("[OLLAMA_SYNC] --- END RAW ---");
        format!("Failed to decode Ollama response: {e}\nRaw preview: {}",
            if raw_text.len() > 200 { &raw_text[..200] } else { &raw_text })
    })?;

    if let Some(err_str) = json.get("error").and_then(|e| e.as_str()) {
        eprintln!("[OLLAMA_SYNC] Ollama returned error field: {err_str}");
        return Err(err_str.to_string());
    }

    eprintln!("[OLLAMA_SYNC] Success. Response keys: {:?}",
        json.as_object().map(|o| o.keys().cloned().collect::<Vec<_>>()));
    Ok(json)
}

async fn fetch_openai_models(api_key: &str, base_url: Option<String>) -> Result<Vec<String>, AppError> {
    let chat_url = base_url
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "https://api.openai.com/v1/chat/completions".to_string());
    let url = model_list_url_from_chat_url(&chat_url);

    let response = reqwest::Client::new()
        .get(url)
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "OpenAI model listing failed".to_string());
        return Err(AppError::Network(parse_provider_error(&error_text)));
    }

    let payload = response.json::<Value>().await?;
    let models = payload
        .get("data")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("id").and_then(Value::as_str).map(String::from))
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

async fn fetch_openai_compatible_models(api_key: &str, base_url: Option<String>) -> Result<Vec<String>, AppError> {
    let chat_url = base_url
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| AppError::Network("Missing provider base URL".to_string()))?;
    let url = model_list_url_from_chat_url(&chat_url);

    let response = reqwest::Client::new()
        .get(url)
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Model listing failed".to_string());
        return Err(AppError::Network(parse_provider_error(&error_text)));
    }

    let payload = response.json::<Value>().await?;
    let models = payload
        .get("data")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("id").and_then(Value::as_str).map(String::from))
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

async fn fetch_claude_models(api_key: &str, base_url: Option<String>) -> Result<Vec<String>, AppError> {
    let url = base_url
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "https://api.anthropic.com/v1/models".to_string());

    let response = reqwest::Client::new()
        .get(url)
        .header("x-api-key", api_key.trim())
        .header("anthropic-version", "2023-06-01")
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Claude model listing failed".to_string());
        return Err(AppError::Network(parse_provider_error(&error_text)));
    }

    let payload = response.json::<Value>().await?;
    let models = payload
        .get("data")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("id").and_then(Value::as_str).map(String::from))
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

async fn fetch_ollama_models(base_url: Option<String>) -> Result<Vec<String>, AppError> {
    let base = base_url
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "http://localhost:11434".to_string());
    let url = format!("{}/api/tags", base.trim_end_matches('/'));

    let response = reqwest::Client::new().get(url).send().await?;
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Ollama model listing failed".to_string());
        return Err(AppError::Network(parse_provider_error(&error_text)));
    }

    let raw_text = response.text().await.map_err(|e| {
        eprintln!("[OLLAMA_MODELS] Failed to read response body: {e}");
        AppError::Network(e.to_string())
    })?;
    eprintln!(
        "[OLLAMA_MODELS] Raw response ({len} chars): {preview}",
        len = raw_text.len(),
        preview = if raw_text.len() > 500 {
            format!("{}...", &raw_text[..500])
        } else {
            raw_text.clone()
        }
    );
    let payload: Value = serde_json::from_str(&raw_text).map_err(|e| {
        eprintln!("[OLLAMA_MODELS] JSON PARSE FAILED: {e}");
        eprintln!("[OLLAMA_MODELS] --- BEGIN RAW TEXT ({len} bytes) ---", len = raw_text.len());
        eprintln!("{raw_text}");
        eprintln!("[OLLAMA_MODELS] --- END RAW TEXT ---");
        AppError::Network(format!("Failed to parse Ollama models response: {e}"))
    })?;
    let models = payload
        .get("models")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("name").and_then(Value::as_str).map(String::from))
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

fn build_health_response(provider: &str, started: Instant, result: Result<(), String>) -> ProviderHealthResponse {
    let latency_ms = started.elapsed().as_millis();
    match result {
        Ok(()) => ProviderHealthResponse {
            provider: provider.to_string(),
            healthy: true,
            message: "Connection OK".to_string(),
            latency_ms,
        },
        Err(message) => ProviderHealthResponse {
            provider: provider.to_string(),
            healthy: false,
            message,
            latency_ms,
        },
    }
}

async fn create_provider_response(
    request: &ChatStreamRequest,
    provider_config: &ProviderConfig,
) -> Result<reqwest::Response, AppError> {
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| AppError::Network(e.to_string()))?;

    match provider_config.provider.as_str() {
        "openai" => {
            let api_key = provider_config
                .api_key
                .as_ref()
                .filter(|v| !v.trim().is_empty())
                .ok_or_else(|| AppError::Network("Missing OpenAI API key".to_string()))?;

            let url = provider_config
                .base_url
                .clone()
                .filter(|v| !v.trim().is_empty())
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
                .filter(|v| !v.trim().is_empty())
                .ok_or_else(|| AppError::Network("Missing Claude API key".to_string()))?;

            let url = provider_config
                .base_url
                .clone()
                .filter(|v| !v.trim().is_empty())
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
                .filter(|v| !v.trim().is_empty())
                .unwrap_or_else(|| "http://localhost:11434".to_string());
            let url = format!("{}/api/chat", base_url.trim_end_matches('/'));

            let response = client
                .post(url)
                .header("Content-Type", "application/json")
                .json(&build_ollama_request_body(request, &provider_config.model))
                .send()
                .await?;

            Ok(response)
        }
        "groq" | "together" => {
            let api_key = provider_config
                .api_key
                .as_ref()
                .filter(|v| !v.trim().is_empty())
                .ok_or_else(|| {
                    AppError::Network(format!(
                        "Missing {} API key",
                        provider_display_name(&provider_config.provider)
                    ))
                })?;

            let url = provider_config
                .base_url
                .clone()
                .filter(|v| !v.trim().is_empty())
                .ok_or_else(|| {
                    AppError::Network(format!(
                        "Missing {} base URL",
                        provider_display_name(&provider_config.provider)
                    ))
                })?;

            let response = client
                .post(url)
                .header("Authorization", format!("Bearer {}", api_key.trim()))
                .header("Content-Type", "application/json")
                .json(&build_openai_request_body(request, &provider_config.model))
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

fn extract_provider_error(provider: &str, payload: &str) -> Option<String> {
    let json = serde_json::from_str::<Value>(payload).ok()?;

    match provider {
        "openai" => json
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(Value::as_str)
            .map(String::from),
        "claude" => {
            let event_type = json.get("type").and_then(Value::as_str).unwrap_or_default();
            if event_type == "error" {
                json.get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(Value::as_str)
                    .map(String::from)
            } else {
                None
            }
        }
        "ollama" => json.get("error").and_then(Value::as_str).map(String::from),
        _ => None,
    }
}

fn extract_provider_token(provider: &str, payload: &str) -> Option<String> {
    let json = serde_json::from_str::<Value>(payload).ok()?;

    match provider {
        "openai" => json
            .get("choices")
            .and_then(Value::as_array)
            .and_then(|c| c.first())
            .and_then(|c| c.get("delta"))
            .and_then(|d| d.get("content"))
            .and_then(Value::as_str)
            .map(String::from),
        "claude" => {
            let event_type = json.get("type").and_then(Value::as_str).unwrap_or_default();
            if event_type != "content_block_delta" {
                return None;
            }
            json.get("delta")
                .and_then(|d| d.get("text"))
                .and_then(Value::as_str)
                .map(String::from)
        }
        "ollama" => json
            .get("message")
            .and_then(|m| m.get("content"))
            .and_then(Value::as_str)
            .filter(|v| !v.is_empty())
            .map(String::from),
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

                            if let Some(provider_error) =
                                extract_provider_error(&provider_config.provider, payload)
                            {
                                return Err(AppError::Network(provider_error));
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
                        // Process any remaining buffer before returning the error
                        let remaining = buffer.trim();
                        if !remaining.is_empty() {
                            eprintln!("[STREAM] Processing remaining buffer on stream error: {} chars", remaining.len());
                            if let Some(err) = extract_provider_error(&provider_config.provider, remaining) {
                                return Err(AppError::Network(err));
                            }
                        }
                        return Err(AppError::Network(error.to_string()));
                    }
                    None => {
                        // CRITICAL: Process remaining buffer before stream end.
                        // Ollama error responses may arrive without a trailing newline
                        // and would otherwise be silently dropped.
                        let remaining = buffer.trim();
                        if !remaining.is_empty() {
                            eprintln!("[STREAM] Processing remaining buffer on stream end ({} chars)", remaining.len());
                            let payload = if provider_config.provider == "ollama" {
                                remaining
                            } else if remaining.starts_with("data:") {
                                remaining.trim_start_matches("data:").trim()
                            } else {
                                return Ok(());
                            };

                            if is_done_payload(&provider_config.provider, payload) {
                                return Ok(());
                            }

                            if let Some(provider_error) =
                                extract_provider_error(&provider_config.provider, payload)
                            {
                                return Err(AppError::Network(provider_error));
                            }

                            if let Some(token) =
                                extract_provider_token(&provider_config.provider, payload)
                            {
                                let _ = app.emit(
                                    "chat-stream-chunk",
                                    StreamChunkEvent {
                                        stream_id: request.stream_id.clone(),
                                        token,
                                    },
                                );
                            }
                        }
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
            .map_err(|e| AppError::Network(e.to_string()))?;

        if let Some(prev) = registry.remove(&request.stream_id) {
            let _ = prev.send(());
        }

        let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel();
        registry.insert(request.stream_id.clone(), cancel_tx);
        cancel_rx
    };

    for provider in providers {
        match stream_from_provider(&app, &request, &provider, &mut cancel_rx).await {
            Ok(()) => {
                return Ok(());
            }
            Err(e) => {
                last_error = Some(e);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| AppError::Network("All providers failed".to_string())))
}

#[tauri::command]
pub fn save_conversation(app: AppHandle, conversation: Conversation, incognito: Option<bool>) -> Result<(), String> {
    if incognito.unwrap_or(false) {
        eprintln!("[INCOGNITO] Blocked save_conversation for {}", conversation.id);
        return Ok(());
    }
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    db::save_conversation(&app_data_dir, conversation).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_message(app: AppHandle, message: Message, incognito: Option<bool>) -> Result<(), String> {
    if incognito.unwrap_or(false) {
        eprintln!("[INCOGNITO] Blocked save_message for {}", message.id);
        return Ok(());
    }
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    db::save_message(&app_data_dir, message).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_conversations(app: AppHandle) -> Result<Vec<Conversation>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    db::list_conversations(&app_data_dir).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct DeleteResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[tauri::command]
pub fn delete_conversation(app: AppHandle, conversation_id: String) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    db::delete_conversation(&app_data_dir, &conversation_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn hard_delete_session(app: AppHandle, conversation_id: String) -> DeleteResult {
    eprintln!("[HARD_DELETE] Attempting to delete conversation {}", conversation_id);

    let app_data_dir = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!("[HARD_DELETE] Failed to resolve app data dir: {}", e);
            return DeleteResult {
                success: false,
                error: Some(e.to_string()),
            };
        }
    };

    match db::delete_conversation(&app_data_dir, &conversation_id) {
        Ok(_) => {
            eprintln!("[HARD_DELETE] Conversation {} deleted from SQLite.", conversation_id);
            DeleteResult {
                success: true,
                error: None,
            }
        }
        Err(e) => {
            eprintln!("[HARD_DELETE] Failed to delete conversation {}: {}", conversation_id, e);
            DeleteResult {
                success: false,
                error: Some(e.to_string()),
            }
        }
    }
}

#[tauri::command]
pub async fn delete_chat(app: AppHandle, chat_id: String, is_privacy_on: bool) -> DeleteResult {
    eprintln!("[DELETE_CHAT] Request — chat_id=\"{}\", is_privacy_on={}", chat_id, is_privacy_on);

    if is_privacy_on {
        // 👉 Privacy mode: wipe WebView partition — no disk I/O
        eprintln!("[DELETE_CHAT] Privacy ON — clearing WebView storage partition for chat: {}", chat_id);
        if let Some(window) = app.get_webview_window("main") {
            if let Err(e) = window.clear_all_browsing_data() {
                eprintln!("[DELETE_CHAT] Failed to clear browsing data: {}", e);
                return DeleteResult {
                    success: false,
                    error: Some(format!("Failed to clear privacy partition: {}", e)),
                };
            }
        }
        eprintln!("[DELETE_CHAT] Privacy chat memory partition wiped successfully for: {}", chat_id);
        DeleteResult {
            success: true,
            error: None,
        }
    } else {
        // 👉 Standard mode: delete from disk (SQLite)
        eprintln!("[DELETE_CHAT] Standard mode — deleting chat from disk: {}", chat_id);
        let app_data_dir = match app.path().app_data_dir() {
            Ok(dir) => dir,
            Err(e) => {
                eprintln!("[DELETE_CHAT] Failed to resolve app data dir: {}", e);
                return DeleteResult {
                    success: false,
                    error: Some(format!("Failed to resolve app data dir: {}", e)),
                };
            }
        };
        match db::delete_conversation(&app_data_dir, &chat_id) {
            Ok(_) => {
                eprintln!("[DELETE_CHAT] Standard chat {} removed from disk (SQLite).", chat_id);
                DeleteResult {
                    success: true,
                    error: None,
                }
            }
            Err(e) => {
                eprintln!("[DELETE_CHAT] Failed to delete standard chat {}: {}", chat_id, e);
                DeleteResult {
                    success: false,
                    error: Some(format!("Target conversation not found on disk: {}", e)),
                }
            }
        }
    }
}

#[tauri::command]
pub async fn wipe_incognito_session(app: AppHandle) -> Result<(), String> {
    eprintln!("[INCOGNITO] Wiping incognito session. Purging WebView storage.");

    if let Some(window) = app.get_webview_window("main") {
        window.clear_all_browsing_data().map_err(|e| e.to_string())?;
    }

    crate::notifications::notify_success(
        &app,
        "Session Wiped",
        "Incognito data cleared. Regular history is untouched.",
    );

    Ok(())
}

#[tauri::command]
pub fn list_messages(app: AppHandle, conversation_id: String) -> Result<Vec<Message>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    db::list_messages(&app_data_dir, conversation_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_user_profile(app: AppHandle, profile: UserProfile) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    db::save_user_profile(&app_data_dir, profile).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_user_profile(app: AppHandle) -> Result<Option<UserProfile>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    db::load_user_profile(&app_data_dir).map_err(|e| e.to_string())
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
        let should_use_tools = agent::should_use_agent_loop(&app_for_stream, &request).await;
        let result = if should_use_tools {
            agent::run_tool_loop_stream(app_for_stream.clone(), request).await
        } else {
            run_stream_with_fallback(app_for_stream.clone(), request).await
        };

        if let Err(error) = result {
            emit_stream_error(&app_for_stream, &stream_id, error.to_string());
        }

        let _ = app_for_stream.emit(
            "chat-stream-done",
            StreamDoneEvent {
                stream_id: stream_id.clone(),
            },
        );

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
        .map_err(|e| e.to_string())?;

    if let Some(cancel_tx) = registry.remove(&stream_id) {
        let _ = cancel_tx.send(());
    }

    Ok(())
}

#[tauri::command]
pub async fn list_provider_models(request: ProviderRequest) -> Result<Vec<String>, String> {
    match request.provider.as_str() {
        "openai" => {
            let api_key = request
                .api_key
                .filter(|v| !v.trim().is_empty())
                .ok_or_else(|| "Missing OpenAI API key".to_string())?;
            fetch_openai_models(&api_key, request.base_url)
                .await
                .map_err(|e| e.to_string())
        }
        "claude" => {
            let api_key = request
                .api_key
                .filter(|v| !v.trim().is_empty())
                .ok_or_else(|| "Missing Claude API key".to_string())?;
            fetch_claude_models(&api_key, request.base_url)
                .await
                .map_err(|e| e.to_string())
        }
        "ollama" => {
            fetch_ollama_models(request.base_url)
                .await
                .map_err(|e| e.to_string())
        }
        "groq" | "together" => {
            let api_key = request
                .api_key
                .filter(|v| !v.trim().is_empty())
                .ok_or_else(|| format!("Missing {} API key", provider_display_name(&request.provider)))?;
            fetch_openai_compatible_models(&api_key, request.base_url)
                .await
                .map_err(|e| e.to_string())
        }
        _ => Err("Unsupported provider".to_string()),
    }
}

#[tauri::command]
pub async fn check_provider_health(request: ProviderRequest) -> Result<ProviderHealthResponse, String> {
    let started = Instant::now();

    let response = match request.provider.as_str() {
        "openai" => {
            let api_key = request
                .api_key
                .filter(|v| !v.trim().is_empty())
                .ok_or_else(|| "Missing OpenAI API key".to_string())?;

            let result = fetch_openai_models(&api_key, request.base_url)
                .await
                .map(|_| ())
                .map_err(|e| e.to_string());

            build_health_response("openai", started, result)
        }
        "claude" => {
            let api_key = request
                .api_key
                .filter(|v| !v.trim().is_empty())
                .ok_or_else(|| "Missing Claude API key".to_string())?;

            let result = fetch_claude_models(&api_key, request.base_url)
                .await
                .map(|_| ())
                .map_err(|e| e.to_string());

            build_health_response("claude", started, result)
        }
        "ollama" => {
            let result = fetch_ollama_models(request.base_url)
                .await
                .map(|_| ())
                .map_err(|e| e.to_string());

            build_health_response("ollama", started, result)
        }
        "groq" | "together" => {
            let api_key = request
                .api_key
                .filter(|v| !v.trim().is_empty())
                .ok_or_else(|| format!("Missing {} API key", provider_display_name(&request.provider)))?;

            let result = fetch_openai_compatible_models(&api_key, request.base_url)
                .await
                .map(|_| ())
                .map_err(|e| e.to_string());

            build_health_response(&request.provider, started, result)
        }
        _ => return Err("Unsupported provider".to_string()),
    };

    Ok(response)
}

// ─── Config Encryption (XOR + Base64) ────────────────────────────────────

const CONFIG_XOR_KEY: &[u8] = b"j4rv1s_c0nfig_s4lt_x0r_2024!";

fn xor_transform(data: &[u8]) -> Vec<u8> {
    data.iter()
        .enumerate()
        .map(|(i, &b)| b ^ CONFIG_XOR_KEY[i % CONFIG_XOR_KEY.len()])
        .collect()
}

fn decode_hex(hex: &str) -> Result<Vec<u8>, String> {
    let hex = hex.trim();
    if hex.len() % 2 != 0 {
        return Err("Config hex length mismatch".to_string());
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&hex[i..i + 2], 16)
                .map_err(|e| format!("Config hex decode error: {e}"))
        })
        .collect()
}

/// V2 format: XOR → Base64 (more compact, not trivially plain text).
fn encrypt_config_v2(plaintext: &str) -> Result<String, String> {
    let xored = xor_transform(plaintext.as_bytes());
    Ok(base64::engine::general_purpose::STANDARD.encode(&xored))
}

fn decrypt_config_v2(encoded: &str) -> Result<String, String> {
    let data = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| format!("Base64 decode error: {e}"))?;
    let decoded = xor_transform(&data);
    String::from_utf8(decoded).map_err(|e| format!("UTF-8 decode error: {e}"))
}

#[tauri::command]
pub fn save_app_settings(app: AppHandle, data: String) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;

    let config_path = app_data_dir.join("jarvis-config.dat");
    let encoded = encrypt_config_v2(&data)?;

    std::fs::write(&config_path, &encoded).map_err(|e| e.to_string())?;
    eprintln!("[CONFIG] Saved {} bytes to {:?}", encoded.len(), config_path);
    Ok(())
}

#[tauri::command]
pub fn load_app_settings(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let config_path = app_data_dir.join("jarvis-config.dat");

    if !config_path.exists() {
        eprintln!("[CONFIG] No config file at {:?}", config_path);
        return Ok(String::new());
    }

    let encoded = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let trimmed = encoded.trim();

    // Try V2 (XOR + Base64) first, then legacy (XOR + hex)
    match decrypt_config_v2(trimmed) {
        Ok(json_str) => {
            eprintln!("[CONFIG] Loaded {} bytes from {:?}", json_str.len(), config_path);
            return Ok(json_str);
        }
        Err(v2_err) => {
            eprintln!("[CONFIG] V2 decode failed (trying legacy hex): {v2_err}");
        }
    }

    // Legacy fallback: XOR + hex (from old saves)
    let decoded_hex = decode_hex(trimmed)?;
    let decoded = xor_transform(&decoded_hex);
    let json_str = String::from_utf8(decoded).map_err(|e| e.to_string())?;
    eprintln!("[CONFIG] Legacy-loaded {} bytes from {:?}", json_str.len(), config_path);

    // Will be upgraded to V2 format on next save
    Ok(json_str)
}

// ─── Nuclear Wipe: Clear all data ────────────────────────────────────────

#[tauri::command]
pub async fn wipe_all_data(app: AppHandle) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    // 1. Clear SQLite database
    db::wipe_all(&app_data_dir).map_err(|e| e.to_string())?;

    // 2. Delete config.dat
    let config_path = app_data_dir.join("jarvis-config.dat");
    if config_path.exists() {
        std::fs::remove_file(&config_path).map_err(|e| e.to_string())?;
    }

    // 3. Clear WebView/Chromium storage (localStorage, IndexedDB, cookies, cache)
    if let Some(window) = app.get_webview_window("main") {
        window.clear_all_browsing_data().map_err(|e| e.to_string())?;
    }

    // 4. Emit success toast to the renderer
    crate::notifications::notify_success(
        &app,
        "Session Wiped",
        "All data has been securely erased.",
    );

    Ok(())
}

#[tauri::command]
pub async fn reset_database(app: AppHandle) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    // 1. Delete database + config
    db::reset_database(&app_data_dir).map_err(|e| e.to_string())?;

    // 2. Delete config.dat
    let config_path = app_data_dir.join("jarvis-config.dat");
    if config_path.exists() {
        std::fs::remove_file(&config_path).map_err(|e| e.to_string())?;
    }

    // 3. Clear WebView storage (localStorage where Zustand persists chats)
    if let Some(window) = app.get_webview_window("main") {
        window.clear_all_browsing_data().map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn restart_application(app: AppHandle) {
    app.restart();
}

// ─── Run Jarvis Task (non-streaming quick action) ─────────────────────────

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JarvisTaskRequest {
    pub task_type: String,
    pub text: String,
    pub provider: String,
    pub model: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub temperature: Option<f64>,
    pub max_tokens: Option<u32>,
}

#[tauri::command]
pub async fn run_jarvis_task(app: AppHandle, request: JarvisTaskRequest) -> Result<String, String> {
    eprintln!("[RUN_TASK] type={}, text.len()={}, provider={}, model={}",
        request.task_type, request.text.len(), request.provider, request.model);

    let system_prompt = match request.task_type.as_str() {
        "explain" => "You are JARVIS, an expert programming mentor. Explain the provided code in detail: describe what it does, how it works, key concepts involved, and any potential issues. Be thorough but clear, and use examples where helpful.",
        "write" => "You are JARVIS, a skilled content writer. Write high-quality, well-structured content based on the user's request. Use clear sections, appropriate tone, and ensure the output is publication-ready. Format with Markdown.",
        "translate" => "You are JARVIS, a professional translator. Translate the user's text accurately while preserving nuance, tone, and formatting. If the target language is not specified, ask. Output only the translation unless context is needed.",
        "brainstorm" => "You are JARVIS, a creative brainstorming partner. Generate diverse, innovative ideas around the user's topic. Think laterally, combine concepts, and provide structured suggestions with brief reasoning for each.",
        "debug" => "You are JARVIS, an expert debugger. Analyze the issue carefully, identify root causes, and provide step-by-step solutions.",
        "summarize" => "You are JARVIS, a precise summarizer. Condense the provided content into a clear, concise summary that captures all key points. Preserve important details, data, and conclusions. Use bullet points for structured summaries.",
        _ => "You are JARVIS, a helpful AI assistant. Answer the user's request clearly and concisely.",
    };

    let provider_config = ProviderConfig {
        provider: request.provider.clone(),
        model: request.model.clone(),
        api_key: request.api_key.clone(),
        base_url: request.base_url.clone(),
        fallback_used: false,
    };

    if provider_config.provider == "ollama" {
        return run_jarvis_task_ollama(app, request, &provider_config, system_prompt).await;
    }
    if provider_config.provider == "openai" || provider_config.provider == "groq" || provider_config.provider == "together" {
        return run_jarvis_task_openai_compat(app, request, &provider_config, system_prompt).await;
    }
    if provider_config.provider == "claude" {
        return run_jarvis_task_claude(app, request, &provider_config, system_prompt).await;
    }

    Err(format!("Unsupported provider: {}", provider_config.provider))
}

async fn run_jarvis_task_ollama(
    _app: AppHandle,
    request: JarvisTaskRequest,
    config: &ProviderConfig,
    system_prompt: &str,
) -> Result<String, String> {
    let base_url = config.base_url.clone()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "http://localhost:11434".to_string());
    let url = format!("{}/api/chat", base_url.trim_end_matches('/'));

    eprintln!("[RUN_TASK_OLLAMA] type={} model={} text.len={}",
        request.task_type, config.model, request.text.len());

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let mut body = json!({
        "model": config.model,
        "stream": false,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": request.text}
        ]
    });

    if request.temperature.is_some() || request.max_tokens.is_some() {
        body["options"] = json!({});
        if let Some(temp) = request.temperature {
            body["options"]["temperature"] = json!(temp);
        }
        if let Some(max) = request.max_tokens {
            body["options"]["num_predict"] = json!(max);
        }
    }

    let payload = call_ollama_raw_sync(&client, &url, body).await?;

    let content = payload
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    eprintln!("[RUN_TASK_OLLAMA] Done: {} chars", content.len());
    Ok(content)
}

async fn run_jarvis_task_openai_compat(
    _app: AppHandle,
    request: JarvisTaskRequest,
    config: &ProviderConfig,
    system_prompt: &str,
) -> Result<String, String> {
    let api_key = config.api_key.as_ref()
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| format!("Missing {} API key", provider_display_name(&config.provider)))?;

    let url = config.base_url.clone()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "https://api.openai.com/v1/chat/completions".to_string());

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let body = json!({
        "model": config.model,
        "stream": false,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": request.text}
        ],
        "temperature": request.temperature.unwrap_or(0.7),
        "max_tokens": request.max_tokens.unwrap_or(1024),
    });

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown".to_string());
        return Err(parse_provider_error(&error_text));
    }

    let raw_text = response.text().await.map_err(|e| format!("Failed to read response: {e}"))?;
    let payload: Value = serde_json::from_str(&raw_text)
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    let content = payload
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|c| c.first())
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    eprintln!("[RUN_TASK_OPENAI] Done: {} chars", content.len());
    Ok(content)
}

async fn run_jarvis_task_claude(
    _app: AppHandle,
    request: JarvisTaskRequest,
    config: &ProviderConfig,
    system_prompt: &str,
) -> Result<String, String> {
    let api_key = config.api_key.as_ref()
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| "Missing Claude API key".to_string())?;

    let url = config.base_url.clone()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "https://api.anthropic.com/v1/messages".to_string());

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let body = json!({
        "model": config.model,
        "stream": false,
        "messages": [
            {"role": "user", "content": request.text}
        ],
        "system": system_prompt,
        "max_tokens": request.max_tokens.unwrap_or(1024),
    });

    let response = client
        .post(&url)
        .header("x-api-key", api_key.trim())
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown".to_string());
        return Err(parse_provider_error(&error_text));
    }

    let raw_text = response.text().await.map_err(|e| format!("Failed to read response: {e}"))?;
    let payload: Value = serde_json::from_str(&raw_text)
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    let content = payload
        .get("content")
        .and_then(|c| c.as_array())
        .and_then(|c| c.first())
        .and_then(|c| c.get("text"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    eprintln!("[RUN_TASK_CLAUDE] Done: {} chars", content.len());
    Ok(content)
}

// ─── Theme Plugin System ──────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ThemeDefinition {
    id: String,
    label: String,
    #[serde(default)]
    is_custom: bool,
    colors: HashMap<String, String>,
}

fn builtin_themes() -> Vec<ThemeDefinition> {
    vec![
        ThemeDefinition {
            id: "default".into(),
            label: "Default Dark".into(),
            is_custom: false,
            colors: [
                ("--bg-main", "#0D1117"),
                ("--bg-panel", "#161B22"),
                ("--accent-glow", "#00F5FF"),
                ("--text-primary", "#F0F6FC"),
                ("--text-body", "#C9D1D9"),
                ("--text-muted", "#8B949E"),
                ("--border-color", "#30363D"),
            ].into_iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
        },
        ThemeDefinition {
            id: "community-blue-neon".into(),
            label: "Blue Neon".into(),
            is_custom: false,
            colors: [
                ("--bg-main", "#0A0E1A"),
                ("--bg-panel", "#111827"),
                ("--accent-glow", "#3B82F6"),
                ("--text-primary", "#E2E8F0"),
                ("--text-body", "#CBD5E1"),
                ("--text-muted", "#6B7280"),
                ("--border-color", "#1E293B"),
            ].into_iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
        },
    ]
}

#[tauri::command]
pub fn list_available_themes(app: AppHandle) -> Result<Vec<ThemeDefinition>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut themes = builtin_themes();

    let themes_dir = app_data_dir.join("themes");

    if !themes_dir.exists() {
        std::fs::create_dir_all(&themes_dir).map_err(|e| e.to_string())?;
        let sample = serde_json::json!({
            "id": "sample-custom-theme",
            "label": "Sample Custom Theme",
            "isCustom": true,
            "colors": {
                "--bg-main": "#1a1b2e",
                "--bg-panel": "#232541",
                "--accent-glow": "#7c3aed",
                "--text-primary": "#e2e8f0",
                "--text-body": "#cbd5e1",
                "--text-muted": "#64748b",
                "--border-color": "#334155"
            }
        });
        let sample_path = themes_dir.join("sample-theme.json");
        std::fs::write(
            &sample_path,
            serde_json::to_string_pretty(&sample).map_err(|e| e.to_string())?,
        ).map_err(|e| e.to_string())?;
        eprintln!("[THEMES] Created sample theme at {:?}", sample_path);
    }

    if let Ok(entries) = std::fs::read_dir(&themes_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                match std::fs::read_to_string(&path) {
                    Ok(content) => {
                        match serde_json::from_str::<ThemeDefinition>(&content) {
                            Ok(mut theme) => {
                                theme.is_custom = true;
                                themes.push(theme);
                            }
                            Err(e) => {
                                eprintln!("[THEMES] Failed to parse {:?}: {}", path, e);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[THEMES] Failed to read {:?}: {}", path, e);
                    }
                }
            }
        }
    }

    eprintln!("[THEMES] Loaded {} themes ({} builtin + {} custom)", themes.len(), 2, themes.len().saturating_sub(2));
    Ok(themes)
}
