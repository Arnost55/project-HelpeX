use std::collections::HashMap;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot, Mutex};

use crate::agent::cancellation::StreamCancellationToken;

use super::protocol::{JsonRpcError, JsonRpcRequest, JsonRpcResponse};

type PendingMap = Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, McpClientError>>>>>;

#[derive(Debug, Clone)]
pub enum McpClientError {
    Cancelled {
        message: String,
    },
    Timeout {
        message: String,
    },
    Disconnected {
        message: String,
    },
    JsonRpc {
        message: String,
        data: Option<Value>,
    },
    MalformedResponse {
        message: String,
        data: Option<Value>,
    },
    Io(String),
    Serialization(String),
}

impl std::fmt::Display for McpClientError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            McpClientError::Cancelled { message }
            | McpClientError::Timeout { message }
            | McpClientError::Disconnected { message }
            | McpClientError::JsonRpc { message, .. }
            | McpClientError::MalformedResponse { message, .. }
            | McpClientError::Io(message)
            | McpClientError::Serialization(message) => write!(f, "{}", message),
        }
    }
}

pub struct McpClient {
    server_name: String,
    request_id: AtomicU64,
    pending: PendingMap,
    write_tx: mpsc::Sender<String>,
    closed: AtomicBool,
}

impl McpClient {
    pub fn new<R, W>(server_name: String, writer: W, reader: R) -> Self
    where
        R: AsyncRead + Send + Unpin + 'static,
        W: AsyncWrite + Send + Unpin + 'static,
    {
        let pending = Arc::new(Mutex::new(HashMap::new()));
        let (write_tx, write_rx) = mpsc::channel::<String>(64);

        spawn_writer(server_name.clone(), writer, write_rx);
        spawn_reader(server_name.clone(), reader, pending.clone());

        Self {
            server_name,
            request_id: AtomicU64::new(1),
            pending,
            write_tx,
            closed: AtomicBool::new(false),
        }
    }

    pub async fn request(
        &self,
        method: &str,
        params: Value,
        timeout_ms: u64,
    ) -> Result<Value, McpClientError> {
        self.request_with_cancel(method, params, timeout_ms, None).await
    }

    pub async fn request_with_cancel(
        &self,
        method: &str,
        params: Value,
        timeout_ms: u64,
        cancellation: Option<StreamCancellationToken>,
    ) -> Result<Value, McpClientError> {
        if self.closed.load(Ordering::SeqCst) {
            return Err(McpClientError::Disconnected {
                message: format!("MCP client '{}' is closed", self.server_name),
            });
        }

        let id = self.request_id.fetch_add(1, Ordering::SeqCst);
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(id),
            method: method.to_string(),
            params,
        };

        let serialized = serde_json::to_string(&request)
            .map_err(|error| McpClientError::Serialization(error.to_string()))?;
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);

        if let Err(error) = self.write_tx.send(serialized).await {
            let _ = self.pending.lock().await.remove(&id);
            return Err(McpClientError::Io(format!(
                "Failed to queue request for '{}': {}",
                self.server_name, error
            )));
        }

        let mut timeout = tokio::time::sleep(std::time::Duration::from_millis(timeout_ms));
        tokio::pin!(timeout);

        if let Some(token) = cancellation {
            let mut cancel_wait = token.child_token();
            tokio::select! {
                _ = cancel_wait.cancelled() => {
                    let _ = self.pending.lock().await.remove(&id);
                    Err(McpClientError::Cancelled {
                        message: format!(
                            "Cancelled while waiting for '{}.{}' response",
                            self.server_name, method
                        ),
                    })
                }
                result = rx => self.map_pending_response(result, method),
                _ = &mut timeout => {
                    let _ = self.pending.lock().await.remove(&id);
                    Err(McpClientError::Timeout {
                        message: format!(
                            "Timed out waiting for '{}.{}' response",
                            self.server_name, method
                        ),
                    })
                }
            }
        } else {
            tokio::select! {
                result = rx => self.map_pending_response(result, method),
                _ = &mut timeout => {
                    let _ = self.pending.lock().await.remove(&id);
                    Err(McpClientError::Timeout {
                        message: format!(
                            "Timed out waiting for '{}.{}' response",
                            self.server_name, method
                        ),
                    })
                }
            }
        }
    }

    pub async fn notify(&self, method: &str, params: Value) -> Result<(), McpClientError> {
        if self.closed.load(Ordering::SeqCst) {
            return Err(McpClientError::Disconnected {
                message: format!("MCP client '{}' is closed", self.server_name),
            });
        }

        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: None,
            method: method.to_string(),
            params,
        };
        let serialized = serde_json::to_string(&request)
            .map_err(|error| McpClientError::Serialization(error.to_string()))?;
        self.write_tx
            .send(serialized)
            .await
            .map_err(|error| McpClientError::Io(error.to_string()))
    }

    pub async fn close(&self) {
        if self.closed.swap(true, Ordering::SeqCst) {
            return;
        }

        let pending = {
            let mut pending = self.pending.lock().await;
            pending.drain().map(|(_, tx)| tx).collect::<Vec<_>>()
        };

        for tx in pending {
            let _ = tx.send(Err(McpClientError::Disconnected {
                message: format!("MCP client '{}' closed", self.server_name),
            }));
        }
    }
}

impl McpClient {
    fn map_pending_response(
        &self,
        result: Result<Result<Value, McpClientError>, oneshot::error::RecvError>,
        method: &str,
    ) -> Result<Value, McpClientError> {
        match result {
            Ok(result) => result,
            Err(_) => Err(McpClientError::Disconnected {
                message: format!(
                    "Server '{}' disconnected before replying to '{}'",
                    self.server_name, method
                ),
            }),
        }
    }
}

fn spawn_writer<W>(server_name: String, writer: W, mut rx: mpsc::Receiver<String>)
where
    W: AsyncWrite + Send + Unpin + 'static,
{
    tokio::spawn(async move {
        let mut writer = Pin::from(Box::new(writer));
        while let Some(message) = rx.recv().await {
            if let Err(error) = writer.write_all(message.as_bytes()).await {
                eprintln!("[MCP:{}] stdin write failed: {}", server_name, error);
                break;
            }
            if let Err(error) = writer.write_all(b"\n").await {
                eprintln!(
                    "[MCP:{}] stdin newline write failed: {}",
                    server_name, error
                );
                break;
            }
            if let Err(error) = writer.flush().await {
                eprintln!("[MCP:{}] stdin flush failed: {}", server_name, error);
                break;
            }
        }
    });
}

fn spawn_reader<R>(server_name: String, reader: R, pending: PendingMap)
where
    R: AsyncRead + Send + Unpin + 'static,
{
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        loop {
            match lines.next_line().await {
                Ok(Some(line)) => {
                    handle_incoming_line(&server_name, &pending, line).await;
                }
                Ok(None) => {
                    drain_pending(
                        &pending,
                        McpClientError::Disconnected {
                            message: format!("MCP server '{}' closed stdout", server_name),
                        },
                    )
                    .await;
                    break;
                }
                Err(error) => {
                    drain_pending(
                        &pending,
                        McpClientError::Disconnected {
                            message: format!("MCP server '{}' read failed: {}", server_name, error),
                        },
                    )
                    .await;
                    break;
                }
            }
        }
    });
}

async fn handle_incoming_line(server_name: &str, pending: &PendingMap, line: String) {
    let parsed = serde_json::from_str::<Value>(&line);
    let value = match parsed {
        Ok(value) => value,
        Err(error) => {
            eprintln!(
                "[MCP:{}] Ignoring malformed JSON-RPC line: {} | {}",
                server_name, error, line
            );
            return;
        }
    };

    let Some(id) = value.get("id").and_then(Value::as_u64) else {
        return;
    };

    let response: Result<JsonRpcResponse, _> = serde_json::from_value(value.clone());
    let result = match response {
        Ok(response) => response_to_result(response),
        Err(error) => Err(McpClientError::MalformedResponse {
            message: format!(
                "Server '{}' returned a malformed JSON-RPC response for id {}: {}",
                server_name, id, error
            ),
            data: Some(value),
        }),
    };

    let sender = {
        let mut pending = pending.lock().await;
        pending.remove(&id)
    };

    if let Some(sender) = sender {
        let _ = sender.send(result);
    }
}

fn response_to_result(response: JsonRpcResponse) -> Result<Value, McpClientError> {
    if response.jsonrpc != "2.0" {
        return Err(McpClientError::MalformedResponse {
            message: format!("Invalid JSON-RPC version '{}'", response.jsonrpc),
            data: Some(serde_json::json!(response)),
        });
    }

    if let Some(error) = response.error {
        return Err(jsonrpc_error_to_client_error(error));
    }

    if let Some(result) = response.result {
        return Ok(result);
    }

    Err(McpClientError::MalformedResponse {
        message: format!("JSON-RPC response {} did not include a result", response.id),
        data: Some(serde_json::json!(response)),
    })
}

fn jsonrpc_error_to_client_error(error: JsonRpcError) -> McpClientError {
    McpClientError::JsonRpc {
        message: format!("JSON-RPC error {}: {}", error.code, error.message),
        data: error.data,
    }
}

async fn drain_pending(pending: &PendingMap, error: McpClientError) {
    let senders = {
        let mut pending = pending.lock().await;
        pending.drain().map(|(_, tx)| tx).collect::<Vec<_>>()
    };

    for sender in senders {
        let _ = sender.send(Err(error.clone()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tokio::io::{duplex, AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader};
    use crate::agent::cancellation::StreamCancellationRegistry;

    async fn read_request<R>(reader: &mut BufReader<R>) -> JsonRpcRequest
    where
        R: AsyncRead + Unpin,
    {
        let mut line = String::new();
        reader.read_line(&mut line).await.unwrap();
        serde_json::from_str(line.trim()).unwrap()
    }

    #[tokio::test]
    async fn routes_initialize_and_tool_call_responses() {
        let (client_side, server_side) = duplex(4096);
        let (client_reader, client_writer) = tokio::io::split(client_side);
        let (server_reader, server_writer) = tokio::io::split(server_side);
        let client = McpClient::new("mock".to_string(), client_writer, client_reader);

        tokio::spawn(async move {
            let mut reader = BufReader::new(server_reader);
            let mut writer = server_writer;

            let init = read_request(&mut reader).await;
            assert_eq!(init.method, "initialize");
            writer
                .write_all(
                    serde_json::to_string(&json!({
                        "jsonrpc": "2.0",
                        "id": init.id.unwrap(),
                        "result": { "capabilities": {} }
                    }))
                    .unwrap()
                    .as_bytes(),
                )
                .await
                .unwrap();
            writer.write_all(b"\n").await.unwrap();

            let tool_call = read_request(&mut reader).await;
            assert_eq!(tool_call.method, "tools/call");
            writer
                .write_all(
                    serde_json::to_string(&json!({
                        "jsonrpc": "2.0",
                        "id": tool_call.id.unwrap(),
                        "result": { "content": [{ "type": "text", "text": "ok" }], "isError": false }
                    }))
                    .unwrap()
                    .as_bytes(),
                )
                .await
                .unwrap();
            writer.write_all(b"\n").await.unwrap();
        });

        let init = client
            .request("initialize", json!({}), 1_000)
            .await
            .unwrap();
        assert_eq!(init, json!({ "capabilities": {} }));

        let result = client
            .request(
                "tools/call",
                json!({ "name": "ping", "arguments": {} }),
                1_000,
            )
            .await
            .unwrap();
        assert_eq!(result["isError"], false);
    }

    #[tokio::test]
    async fn supports_concurrent_out_of_order_responses() {
        let (client_side, server_side) = duplex(4096);
        let (client_reader, client_writer) = tokio::io::split(client_side);
        let (server_reader, mut server_writer) = tokio::io::split(server_side);
        let client = McpClient::new("mock".to_string(), client_writer, client_reader);

        tokio::spawn(async move {
            let mut reader = BufReader::new(server_reader);
            let first = read_request(&mut reader).await;
            let second = read_request(&mut reader).await;

            server_writer
                .write_all(
                    format!(
                        "{{\"jsonrpc\":\"2.0\",\"id\":{},\"result\":{{\"value\":\"second\"}}}}\n",
                        second.id.unwrap()
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
            server_writer
                .write_all(
                    format!(
                        "{{\"jsonrpc\":\"2.0\",\"id\":{},\"result\":{{\"value\":\"first\"}}}}\n",
                        first.id.unwrap()
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
        });

        let one = client.request("one", json!({}), 1_000);
        let two = client.request("two", json!({}), 1_000);
        let (one, two) = tokio::join!(one, two);

        assert_eq!(one.unwrap()["value"], "first");
        assert_eq!(two.unwrap()["value"], "second");
    }

    #[tokio::test]
    async fn times_out_when_server_never_replies() {
        let (client_side, server_side) = duplex(4096);
        let (client_reader, client_writer) = tokio::io::split(client_side);
        let (server_reader, server_writer) = tokio::io::split(server_side);
        let client = McpClient::new("mock".to_string(), client_writer, client_reader);

        tokio::spawn(async move {
            let mut reader = BufReader::new(server_reader);
            let _ = read_request(&mut reader).await;
            let _hold_writer = server_writer;
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        });

        let error = client.request("hang", json!({}), 50).await.unwrap_err();
        assert!(matches!(error, McpClientError::Timeout { .. }));
    }

    #[tokio::test]
    async fn reports_malformed_response() {
        let (client_side, server_side) = duplex(4096);
        let (client_reader, client_writer) = tokio::io::split(client_side);
        let (server_reader, mut server_writer) = tokio::io::split(server_side);
        let client = McpClient::new("mock".to_string(), client_writer, client_reader);

        tokio::spawn(async move {
            let mut reader = BufReader::new(server_reader);
            let request = read_request(&mut reader).await;
            server_writer
                .write_all(
                    format!("{{\"jsonrpc\":\"2.0\",\"id\":{}}}\n", request.id.unwrap()).as_bytes(),
                )
                .await
                .unwrap();
        });

        let error = client
            .request("broken", json!({}), 1_000)
            .await
            .unwrap_err();
        assert!(matches!(error, McpClientError::MalformedResponse { .. }));
    }

    #[tokio::test]
    async fn reports_jsonrpc_error_response() {
        let (client_side, server_side) = duplex(4096);
        let (client_reader, client_writer) = tokio::io::split(client_side);
        let (server_reader, mut server_writer) = tokio::io::split(server_side);
        let client = McpClient::new("mock".to_string(), client_writer, client_reader);

        tokio::spawn(async move {
            let mut reader = BufReader::new(server_reader);
            let request = read_request(&mut reader).await;
            server_writer
                .write_all(
                    format!(
                        "{{\"jsonrpc\":\"2.0\",\"id\":{},\"error\":{{\"code\":-32000,\"message\":\"boom\"}}}}\n",
                        request.id.unwrap()
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
        });

        let error = client.request("fail", json!({}), 1_000).await.unwrap_err();
        assert!(matches!(error, McpClientError::JsonRpc { .. }));
    }

    #[tokio::test]
    async fn reports_disconnect_when_server_drops_during_request() {
        let (client_side, server_side) = duplex(4096);
        let (client_reader, client_writer) = tokio::io::split(client_side);
        let (server_reader, server_writer) = tokio::io::split(server_side);
        let client = McpClient::new("mock".to_string(), client_writer, client_reader);

        tokio::spawn(async move {
            let mut reader = BufReader::new(server_reader);
            let _ = read_request(&mut reader).await;
            drop(server_writer);
        });

        let error = client
            .request("disconnect", json!({}), 1_000)
            .await
            .unwrap_err();
        assert!(matches!(error, McpClientError::Disconnected { .. }));
    }

    #[tokio::test]
    async fn cancels_pending_request_and_ignores_late_response() {
        let (client_side, server_side) = duplex(4096);
        let (client_reader, client_writer) = tokio::io::split(client_side);
        let (server_reader, mut server_writer) = tokio::io::split(server_side);
        let client = McpClient::new("mock".to_string(), client_writer, client_reader);
        let registry = StreamCancellationRegistry::default();
        let token = registry.register("stream-1").await;

        tokio::spawn(async move {
            let mut reader = BufReader::new(server_reader);
            let request = read_request(&mut reader).await;
            tokio::time::sleep(std::time::Duration::from_millis(80)).await;
            server_writer
                .write_all(
                    format!(
                        "{{\"jsonrpc\":\"2.0\",\"id\":{},\"result\":{{\"value\":\"late\"}}}}\n",
                        request.id.unwrap()
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
        });

        let cancel_registry = registry;
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            cancel_registry.cancel("stream-1").await;
        });

        let error = client
            .request_with_cancel("late", json!({}), 1_000, Some(token))
            .await
            .unwrap_err();
        assert!(matches!(error, McpClientError::Cancelled { .. }));
    }
}
