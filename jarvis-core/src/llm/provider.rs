use std::pin::Pin;

use async_trait::async_trait;
use futures_util::Stream;
use serde_json::Value;

#[async_trait]
pub trait LlmProvider: Send + Sync {
    fn name(&self) -> &'static str;
    async fn chat_stream(
        &self,
        model: &str,
        messages: Vec<Value>,
        api_key: Option<String>,
        base_url: Option<String>,
        temperature: Option<f32>,
        max_tokens: Option<u32>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<Value, String>> + Send>>, String>;
    fn validate_credentials(&self) -> Result<(), String> {
        Ok(())
    }
}

pub enum ProviderWrapper {
    OpenAi(Box<dyn LlmProvider>),
    Claude(Box<dyn LlmProvider>),
    Ollama(Box<dyn LlmProvider>),
    Groq(Box<dyn LlmProvider>),
    Together(Box<dyn LlmProvider>),
}

impl ProviderWrapper {
    pub fn name(&self) -> &'static str {
        match self {
            ProviderWrapper::OpenAi(p) => p.name(),
            ProviderWrapper::Claude(p) => p.name(),
            ProviderWrapper::Ollama(p) => p.name(),
            ProviderWrapper::Groq(p) => p.name(),
            ProviderWrapper::Together(p) => p.name(),
        }
    }
}
