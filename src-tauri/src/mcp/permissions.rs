use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use super::protocol::McpTool;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PermissionLevel {
    Read,
    Write,
    Execute,
    Sensitive,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PermissionDecision {
    Allow,
    Ask,
    Deny,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionEvaluation {
    pub level: PermissionLevel,
    pub decision: PermissionDecision,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionPolicy {
    #[serde(default)]
    pub default_decisions: PermissionDecisionMatrix,
    #[serde(default)]
    pub server_rules: Vec<ServerPermissionRule>,
    #[serde(default)]
    pub tool_rules: Vec<ToolPermissionRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionDecisionMatrix {
    pub read: PermissionDecision,
    pub write: PermissionDecision,
    pub execute: PermissionDecision,
    pub sensitive: PermissionDecision,
    pub unknown: PermissionDecision,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerPermissionRule {
    pub server_name: String,
    pub level: Option<PermissionLevel>,
    pub decision: Option<PermissionDecision>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolPermissionRule {
    pub server_name: Option<String>,
    pub tool_name: String,
    pub level: Option<PermissionLevel>,
    pub decision: Option<PermissionDecision>,
}

impl Default for PermissionPolicy {
    fn default() -> Self {
        Self {
            default_decisions: PermissionDecisionMatrix::default(),
            server_rules: Vec::new(),
            tool_rules: Vec::new(),
        }
    }
}

impl Default for PermissionDecisionMatrix {
    fn default() -> Self {
        Self {
            read: PermissionDecision::Allow,
            write: PermissionDecision::Ask,
            execute: PermissionDecision::Ask,
            sensitive: PermissionDecision::Deny,
            unknown: PermissionDecision::Ask,
        }
    }
}

pub fn evaluate_permission(
    policy: &PermissionPolicy,
    server_name: &str,
    tool: &McpTool,
) -> PermissionEvaluation {
    if let Some(rule) = policy.tool_rules.iter().find(|rule| {
        rule.tool_name == tool.name
            && rule
                .server_name
                .as_deref()
                .map_or(true, |server| server == server_name)
    }) {
        let level = rule
            .level
            .or_else(|| extract_permission_level(tool))
            .unwrap_or(PermissionLevel::Unknown);
        let decision = rule
            .decision
            .unwrap_or_else(|| default_decision_for_level(&policy.default_decisions, level));

        return PermissionEvaluation {
            level,
            decision,
            source: "tool_rule".to_string(),
        };
    }

    if let Some(rule) = policy
        .server_rules
        .iter()
        .find(|rule| rule.server_name == server_name)
    {
        let level = rule
            .level
            .or_else(|| extract_permission_level(tool))
            .unwrap_or(PermissionLevel::Unknown);
        let decision = rule
            .decision
            .unwrap_or_else(|| default_decision_for_level(&policy.default_decisions, level));

        return PermissionEvaluation {
            level,
            decision,
            source: "server_rule".to_string(),
        };
    }

    if let Some(level) = extract_permission_level(tool) {
        return PermissionEvaluation {
            level,
            decision: default_decision_for_level(&policy.default_decisions, level),
            source: "tool_metadata".to_string(),
        };
    }

    PermissionEvaluation {
        level: PermissionLevel::Unknown,
        decision: policy.default_decisions.unknown,
        source: "default".to_string(),
    }
}

fn default_decision_for_level(
    decisions: &PermissionDecisionMatrix,
    level: PermissionLevel,
) -> PermissionDecision {
    match level {
        PermissionLevel::Read => decisions.read,
        PermissionLevel::Write => decisions.write,
        PermissionLevel::Execute => decisions.execute,
        PermissionLevel::Sensitive => decisions.sensitive,
        PermissionLevel::Unknown => decisions.unknown,
    }
}

fn extract_permission_level(tool: &McpTool) -> Option<PermissionLevel> {
    tool.annotations
        .as_ref()
        .and_then(find_level_in_metadata)
        .or_else(|| tool.metadata.as_ref().and_then(find_level_in_metadata))
}

fn find_level_in_metadata(value: &Value) -> Option<PermissionLevel> {
    let direct = value
        .get("helpexPermissionLevel")
        .and_then(Value::as_str)
        .or_else(|| value.get("permissionLevel").and_then(Value::as_str))
        .or_else(|| {
            value
                .get("helpex")
                .and_then(|nested| nested.get("permissionLevel"))
                .and_then(Value::as_str)
        })
        .or_else(|| {
            value
                .get("helpex")
                .and_then(|nested| nested.get("permission"))
                .and_then(Value::as_str)
        })
        .or_else(|| value.get("permission").and_then(Value::as_str));

    direct.and_then(parse_permission_level)
}

fn parse_permission_level(input: &str) -> Option<PermissionLevel> {
    match input.to_ascii_lowercase().as_str() {
        "read" => Some(PermissionLevel::Read),
        "write" => Some(PermissionLevel::Write),
        "execute" => Some(PermissionLevel::Execute),
        "sensitive" => Some(PermissionLevel::Sensitive),
        "unknown" => Some(PermissionLevel::Unknown),
        _ => None,
    }
}

pub fn get_policy_path(app_handle: &AppHandle) -> std::path::PathBuf {
    app_handle
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("mcp_policy.json")
}

pub async fn load_permission_policy(app_handle: &AppHandle) -> Result<PermissionPolicy, String> {
    let path = get_policy_path(app_handle);
    if !path.exists() {
        let policy = PermissionPolicy::default();
        save_permission_policy(app_handle, &policy).await?;
        return Ok(policy);
    }

    let contents = tokio::fs::read_to_string(&path)
        .await
        .map_err(|error| error.to_string())?;
    serde_json::from_str(&contents).map_err(|error| error.to_string())
}

async fn save_permission_policy(
    app_handle: &AppHandle,
    policy: &PermissionPolicy,
) -> Result<(), String> {
    let path = get_policy_path(app_handle);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| error.to_string())?;
    }

    let contents = serde_json::to_string_pretty(policy).map_err(|error| error.to_string())?;
    tokio::fs::write(path, contents)
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn tool_with_metadata(level: &str) -> McpTool {
        McpTool {
            name: "weather".to_string(),
            description: Some("Weather".to_string()),
            input_schema: json!({"type":"object"}),
            annotations: Some(json!({ "helpexPermissionLevel": level })),
            metadata: None,
        }
    }

    #[test]
    fn metadata_drives_default_decision() {
        let policy = PermissionPolicy::default();
        let evaluation = evaluate_permission(&policy, "weather", &tool_with_metadata("read"));
        assert_eq!(evaluation.level, PermissionLevel::Read);
        assert_eq!(evaluation.decision, PermissionDecision::Allow);
        assert_eq!(evaluation.source, "tool_metadata");
    }

    #[test]
    fn unknown_tools_default_to_ask() {
        let tool = McpTool {
            name: "mystery".to_string(),
            description: None,
            input_schema: json!({"type":"object"}),
            annotations: None,
            metadata: None,
        };
        let evaluation = evaluate_permission(&PermissionPolicy::default(), "unknown", &tool);
        assert_eq!(evaluation.level, PermissionLevel::Unknown);
        assert_eq!(evaluation.decision, PermissionDecision::Ask);
    }

    #[test]
    fn tool_rules_override_defaults() {
        let policy = PermissionPolicy {
            default_decisions: PermissionDecisionMatrix::default(),
            server_rules: Vec::new(),
            tool_rules: vec![ToolPermissionRule {
                server_name: Some("ops".to_string()),
                tool_name: "restart".to_string(),
                level: Some(PermissionLevel::Sensitive),
                decision: Some(PermissionDecision::Deny),
            }],
        };

        let tool = McpTool {
            name: "restart".to_string(),
            description: None,
            input_schema: json!({"type":"object"}),
            annotations: Some(json!({ "helpexPermissionLevel": "read" })),
            metadata: None,
        };

        let evaluation = evaluate_permission(&policy, "ops", &tool);
        assert_eq!(evaluation.level, PermissionLevel::Sensitive);
        assert_eq!(evaluation.decision, PermissionDecision::Deny);
        assert_eq!(evaluation.source, "tool_rule");
    }
}
