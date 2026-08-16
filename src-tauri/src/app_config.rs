use std::fs;
use std::path::PathBuf;

use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SetupState {
    #[serde(default)]
    pub completed: bool,
    #[serde(default)]
    pub version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub version: u32,
    pub theme: String,
    pub provider: String,
    pub model: String,
    pub fallback_provider: String,
    pub fallback_model: String,
    pub ollama_base_url: String,
    pub groq_base_url: String,
    pub together_base_url: String,
    pub temperature_milli: u16,
    pub max_tokens: u32,
    #[serde(default)]
    pub setup: SetupState,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: 1,
            theme: "default-dark".to_string(),
            provider: "openai".to_string(),
            model: "gpt-4o-mini".to_string(),
            fallback_provider: "none".to_string(),
            fallback_model: String::new(),
            ollama_base_url: "http://127.0.0.1:11434".to_string(),
            groq_base_url: "https://api.groq.com/openai/v1/chat/completions".to_string(),
            together_base_url: "https://api.together.xyz/v1/chat/completions".to_string(),
            temperature_milli: 700,
            max_tokens: 1024,
            setup: SetupState::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfigInput {
    pub theme: String,
    pub provider: String,
    pub model: String,
    pub fallback_provider: String,
    pub fallback_model: String,
    pub ollama_base_url: String,
    pub groq_base_url: String,
    pub together_base_url: String,
    pub temperature: f32,
    pub max_tokens: u32,
    #[serde(default)]
    pub setup: SetupState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfigView {
    pub theme: String,
    pub provider: String,
    pub model: String,
    pub fallback_provider: String,
    pub fallback_model: String,
    pub ollama_base_url: String,
    pub groq_base_url: String,
    pub together_base_url: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub setup: SetupState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyAppConfig {
    theme: Option<String>,
    provider: Option<String>,
    model: Option<String>,
    fallback_provider: Option<String>,
    fallback_model: Option<String>,
    ollama_base_url: Option<String>,
    groq_base_url: Option<String>,
    together_base_url: Option<String>,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
    setup_completed: Option<bool>,
}

const LEGACY_CONFIG_XOR_KEY: &[u8] = b"j4rv1s_c0nfig_s4lt_x0r_2024!";

pub fn app_config_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("app_config.json")
}

fn legacy_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("jarvis-config.dat"))
}

fn xor_transform(data: &[u8]) -> Vec<u8> {
    data.iter()
        .enumerate()
        .map(|(index, byte)| byte ^ LEGACY_CONFIG_XOR_KEY[index % LEGACY_CONFIG_XOR_KEY.len()])
        .collect()
}

fn decode_hex(hex: &str) -> Result<Vec<u8>, String> {
    let trimmed = hex.trim();
    if trimmed.len() % 2 != 0 {
        return Err("Config hex length mismatch".to_string());
    }

    (0..trimmed.len())
        .step_by(2)
        .map(|index| {
            u8::from_str_radix(&trimmed[index..index + 2], 16)
                .map_err(|error| format!("Config hex decode error: {error}"))
        })
        .collect()
}

fn decrypt_legacy_payload(encoded: &str) -> Result<String, String> {
    let trimmed = encoded.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }

    if let Ok(data) = base64::engine::general_purpose::STANDARD.decode(trimmed) {
        let decoded = xor_transform(&data);
        if let Ok(text) = String::from_utf8(decoded) {
            return Ok(text);
        }
    }

    let decoded_hex = decode_hex(trimmed)?;
    let decoded = xor_transform(&decoded_hex);
    String::from_utf8(decoded).map_err(|error| error.to_string())
}

fn migrate_legacy_config(app: &AppHandle) -> Result<Option<AppConfig>, String> {
    let path = legacy_config_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let encoded = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let json = decrypt_legacy_payload(&encoded)?;
    if json.trim().is_empty() {
        let _ = fs::remove_file(path);
        return Ok(None);
    }

    let legacy: LegacyAppConfig =
        serde_json::from_str(&json).map_err(|error| format!("Legacy config parse failed: {error}"))?;

    let mut config = AppConfig::default();
    if let Some(value) = legacy.theme.filter(|value| !value.trim().is_empty()) {
        config.theme = value;
    }
    if let Some(value) = legacy.provider.filter(|value| !value.trim().is_empty()) {
        config.provider = value;
    }
    if let Some(value) = legacy.model.filter(|value| !value.trim().is_empty()) {
        config.model = value;
    }
    if let Some(value) = legacy
        .fallback_provider
        .filter(|value| !value.trim().is_empty())
    {
        config.fallback_provider = value;
    }
    if let Some(value) = legacy.fallback_model {
        config.fallback_model = value;
    }
    if let Some(value) = legacy.ollama_base_url.filter(|value| !value.trim().is_empty()) {
        config.ollama_base_url = value;
    }
    if let Some(value) = legacy.groq_base_url.filter(|value| !value.trim().is_empty()) {
        config.groq_base_url = value;
    }
    if let Some(value) = legacy
        .together_base_url
        .filter(|value| !value.trim().is_empty())
    {
        config.together_base_url = value;
    }
    if let Some(value) = legacy.temperature {
        config.temperature_milli = (value.clamp(0.0, 2.0) * 1000.0).round() as u16;
    }
    if let Some(value) = legacy.max_tokens {
        config.max_tokens = value.clamp(64, 8192);
    }
    if legacy.setup_completed.unwrap_or(false) {
        config.setup.completed = true;
        config.setup.version = 1;
    }

    let _ = fs::remove_file(path);
    Ok(Some(config))
}

pub fn load_app_config(app: &AppHandle) -> Result<AppConfig, String> {
    let path = app_config_path(app);
    if path.exists() {
        let json = fs::read_to_string(path).map_err(|error| error.to_string())?;
        return serde_json::from_str(&json).map_err(|error| error.to_string());
    }

    if let Some(config) = migrate_legacy_config(app)? {
        save_app_config(app, &config)?;
        return Ok(config);
    }

    Ok(AppConfig::default())
}

pub fn save_app_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = app_config_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let json = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
    fs::write(path, json).map_err(|error| error.to_string())
}

pub fn config_from_input(input: AppConfigInput) -> AppConfig {
    AppConfig {
        version: 1,
        theme: input.theme,
        provider: input.provider,
        model: input.model,
        fallback_provider: input.fallback_provider,
        fallback_model: input.fallback_model,
        ollama_base_url: input.ollama_base_url,
        groq_base_url: input.groq_base_url,
        together_base_url: input.together_base_url,
        temperature_milli: (input.temperature.clamp(0.0, 2.0) * 1000.0).round() as u16,
        max_tokens: input.max_tokens.clamp(64, 8192),
        setup: input.setup,
    }
}

pub fn config_to_view(config: AppConfig) -> AppConfigView {
    AppConfigView {
        theme: config.theme,
        provider: config.provider,
        model: config.model,
        fallback_provider: config.fallback_provider,
        fallback_model: config.fallback_model,
        ollama_base_url: config.ollama_base_url,
        groq_base_url: config.groq_base_url,
        together_base_url: config.together_base_url,
        temperature: config.temperature_milli as f32 / 1000.0,
        max_tokens: config.max_tokens,
        setup: config.setup,
    }
}
