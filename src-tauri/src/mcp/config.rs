use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::permissions::PermissionEvaluation;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct McpServerEnvironmentEntry {
    pub name: String,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default)]
    pub secret: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PersistedServerConfig {
    pub name: String,
    #[serde(default = "default_transport")]
    pub transport: String,
    pub cmd: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: Vec<McpServerEnvironmentEntry>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub disabled_tools: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfigInput {
    pub name: String,
    #[serde(default = "default_transport")]
    pub transport: String,
    pub cmd: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: Vec<McpServerEnvironmentEntry>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum McpServerStatus {
    Starting,
    Connected,
    Failed,
    Disconnected,
    Disabled,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolView {
    pub name: String,
    pub description: Option<String>,
    pub provider_safe_alias: String,
    pub enabled: bool,
    pub permission: PermissionEvaluation,
    pub input_schema: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerView {
    pub name: String,
    pub transport: String,
    pub cmd: String,
    pub args: Vec<String>,
    pub env: Vec<McpServerEnvironmentEntry>,
    pub enabled: bool,
    pub status: McpServerStatus,
    pub error: Option<String>,
    pub tool_count: usize,
    pub disabled_tool_count: usize,
    pub tools: Vec<McpToolView>,
}

fn default_transport() -> String {
    "stdio".to_string()
}

fn default_enabled() -> bool {
    true
}
