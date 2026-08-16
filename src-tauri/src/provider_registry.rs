use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCapabilities {
    pub streaming: bool,
    pub tool_calling: bool,
    pub dynamic_models: bool,
    pub vision: bool,
    pub custom_base_url: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDefinition {
    pub id: String,
    pub display_name: String,
    pub api_type: String,
    pub default_base_url: Option<String>,
    pub requires_api_key: bool,
    pub supports_model_listing: bool,
    pub supports_streaming: bool,
    pub supports_tool_calling: bool,
    pub supports_vision: bool,
    pub supports_custom_base_url: bool,
    pub manual_model_entry: bool,
    pub capabilities: ProviderCapabilities,
}

fn definition(
    id: &str,
    display_name: &str,
    api_type: &str,
    default_base_url: Option<&str>,
    requires_api_key: bool,
    supports_model_listing: bool,
    supports_streaming: bool,
    supports_tool_calling: bool,
    supports_vision: bool,
    supports_custom_base_url: bool,
    manual_model_entry: bool,
) -> ProviderDefinition {
    ProviderDefinition {
        id: id.to_string(),
        display_name: display_name.to_string(),
        api_type: api_type.to_string(),
        default_base_url: default_base_url.map(ToString::to_string),
        requires_api_key,
        supports_model_listing,
        supports_streaming,
        supports_tool_calling,
        supports_vision,
        supports_custom_base_url,
        manual_model_entry,
        capabilities: ProviderCapabilities {
            streaming: supports_streaming,
            tool_calling: supports_tool_calling,
            dynamic_models: supports_model_listing,
            vision: supports_vision,
            custom_base_url: supports_custom_base_url,
        },
    }
}

pub fn supported_providers() -> Vec<ProviderDefinition> {
    vec![
        definition(
            "openai",
            "OpenAI",
            "openai",
            Some("https://api.openai.com/v1/chat/completions"),
            true,
            true,
            true,
            true,
            true,
            true,
            true,
        ),
        definition(
            "claude",
            "Anthropic",
            "anthropic",
            Some("https://api.anthropic.com/v1/messages"),
            true,
            true,
            true,
            true,
            true,
            true,
            true,
        ),
        definition(
            "ollama",
            "Ollama",
            "ollama",
            Some("http://127.0.0.1:11434"),
            false,
            true,
            true,
            true,
            false,
            true,
            true,
        ),
        definition(
            "groq",
            "Groq",
            "openai-compatible",
            Some("https://api.groq.com/openai/v1/chat/completions"),
            true,
            true,
            true,
            true,
            false,
            true,
            true,
        ),
        definition(
            "together",
            "Together",
            "openai-compatible",
            Some("https://api.together.xyz/v1/chat/completions"),
            true,
            true,
            true,
            true,
            false,
            true,
            true,
        ),
    ]
}

pub fn provider_definition(provider_id: &str) -> Option<ProviderDefinition> {
    supported_providers()
        .into_iter()
        .find(|provider| provider.id == provider_id)
}

pub fn supports_tool_calling(provider_id: &str) -> bool {
    provider_definition(provider_id)
        .map(|provider| provider.supports_tool_calling)
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_includes_expected_supported_providers() {
        let providers = supported_providers();
        let ids = providers
            .iter()
            .map(|provider| provider.id.as_str())
            .collect::<Vec<_>>();

        assert!(ids.contains(&"openai"));
        assert!(ids.contains(&"claude"));
        assert!(ids.contains(&"ollama"));
        assert!(ids.contains(&"groq"));
        assert!(ids.contains(&"together"));
    }

    #[test]
    fn ollama_registry_entry_is_local_and_keyless() {
        let ollama = provider_definition("ollama").expect("ollama provider should exist");
        assert!(!ollama.requires_api_key);
        assert!(ollama.supports_model_listing);
        assert_eq!(
            ollama.default_base_url.as_deref(),
            Some("http://127.0.0.1:11434")
        );
    }
}
