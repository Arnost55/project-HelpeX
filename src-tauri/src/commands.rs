use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use futures_util::StreamExt;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::db;
use crate::error::AppError;
use crate::models::{
    Conversation, Message, OpenAiStreamRequest, StreamChunkEvent, StreamDoneEvent, StreamErrorEvent,
};

static STREAM_CANCEL_REGISTRY: OnceLock<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>> =
    OnceLock::new();

fn stream_cancel_registry() -> &'static Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>> {
    STREAM_CANCEL_REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn parse_openai_error(raw: &str) -> String {
    if raw.trim().is_empty() {
        return "OpenAI request failed".to_string();
    }

    match serde_json::from_str::<Value>(raw) {
        Ok(json) => json
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .unwrap_or_else(|| raw.to_string()),
        Err(_) => raw.to_string(),
    }
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

async fn run_openai_stream(app: AppHandle, request: OpenAiStreamRequest) -> Result<(), AppError> {
    let response = reqwest::Client::new()
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", request.api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": request.model,
            "stream": true,
            "messages": request.messages,
        }))
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "OpenAI request failed".to_string());
        return Err(AppError::Network(parse_openai_error(&error_text)));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
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

    loop {
        tokio::select! {
            _ = &mut cancel_rx => {
                break;
            }
            next_chunk = stream.next() => {
                match next_chunk {
                    Some(Ok(bytes)) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));
                        let lines = buffer.split('\n').map(str::to_string).collect::<Vec<_>>();
                        buffer = lines.last().cloned().unwrap_or_default();

                        for line in lines.iter().take(lines.len().saturating_sub(1)) {
                            let trimmed = line.trim();
                            if !trimmed.starts_with("data:") {
                                continue;
                            }

                            let payload = trimmed.trim_start_matches("data:").trim();
                            if payload == "[DONE]" {
                                let _ = app.emit(
                                    "chat-stream-done",
                                    StreamDoneEvent {
                                        stream_id: request.stream_id.clone(),
                                    },
                                );
                                return Ok(());
                            }

                            if let Ok(json) = serde_json::from_str::<Value>(payload) {
                                if let Some(token) = json
                                    .get("choices")
                                    .and_then(Value::as_array)
                                    .and_then(|choices| choices.first())
                                    .and_then(|choice| choice.get("delta"))
                                    .and_then(|delta| delta.get("content"))
                                    .and_then(Value::as_str)
                                {
                                    let _ = app.emit(
                                        "chat-stream-chunk",
                                        StreamChunkEvent {
                                            stream_id: request.stream_id.clone(),
                                            token: token.to_string(),
                                        },
                                    );
                                }
                            }
                        }
                    }
                    Some(Err(error)) => {
                        return Err(AppError::Network(error.to_string()));
                    }
                    None => {
                        break;
                    }
                }
            }
        }
    }

    let _ = app.emit(
        "chat-stream-done",
        StreamDoneEvent {
            stream_id: request.stream_id,
        },
    );
    Ok(())
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
pub async fn stream_openai_chat(app: AppHandle, request: OpenAiStreamRequest) -> Result<(), String> {
    if request.api_key.trim().is_empty() {
        return Err("Missing OpenAI API key".to_string());
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
        if let Err(error) = run_openai_stream(app_for_stream.clone(), request).await {
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
pub fn cancel_openai_stream(stream_id: String) -> Result<(), String> {
    let mut registry = stream_cancel_registry()
        .lock()
        .map_err(|err| err.to_string())?;

    if let Some(cancel_tx) = registry.remove(&stream_id) {
        let _ = cancel_tx.send(());
    }

    Ok(())
}
