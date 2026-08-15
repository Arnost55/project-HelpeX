use std::collections::HashMap;

use tauri::State;
use tokio::sync::{watch, Mutex};

#[derive(Default)]
pub struct StreamCancellationRegistry {
    tokens: Mutex<HashMap<String, watch::Sender<bool>>>,
}

#[derive(Clone)]
pub struct StreamCancellationToken {
    stream_id: String,
    rx: watch::Receiver<bool>,
}

impl StreamCancellationRegistry {
    pub async fn register(&self, stream_id: &str) -> StreamCancellationToken {
        let mut tokens = self.tokens.lock().await;
        if let Some(existing) = tokens.remove(stream_id) {
            let _ = existing.send(true);
        }

        let (tx, rx) = watch::channel(false);
        tokens.insert(stream_id.to_string(), tx);

        StreamCancellationToken {
            stream_id: stream_id.to_string(),
            rx,
        }
    }

    pub async fn cancel(&self, stream_id: &str) {
        if let Some(sender) = self.tokens.lock().await.remove(stream_id) {
            let _ = sender.send(true);
        }
    }

    pub async fn finish(&self, stream_id: &str) {
        self.tokens.lock().await.remove(stream_id);
    }

    pub async fn cancel_all(&self) {
        let senders = {
            let mut tokens = self.tokens.lock().await;
            tokens.drain().map(|(_, sender)| sender).collect::<Vec<_>>()
        };

        for sender in senders {
            let _ = sender.send(true);
        }
    }
}

impl StreamCancellationToken {
    pub fn stream_id(&self) -> &str {
        &self.stream_id
    }

    pub fn child_token(&self) -> Self {
        self.clone()
    }

    pub fn is_cancelled(&self) -> bool {
        *self.rx.borrow()
    }

    pub async fn cancelled(&mut self) {
        if *self.rx.borrow() {
            return;
        }

        while self.rx.changed().await.is_ok() {
            if *self.rx.borrow() {
                return;
            }
        }
    }
}

pub async fn register_stream_token(
    registry: State<'_, StreamCancellationRegistry>,
    stream_id: &str,
) -> StreamCancellationToken {
    registry.register(stream_id).await
}
