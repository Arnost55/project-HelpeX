use serde::{Deserialize, Serialize};

use super::permissions::{
    evaluate_permission, PermissionDecision, PermissionEvaluation, PermissionLevel, PermissionPolicy,
};
use super::protocol::McpTool;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RequestOrigin {
    DirectUser,
    System,
    Automation,
    ToolResult,
    UntrustedContent,
    ExternalEvent,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RequestAuthority {
    DirectUserInstruction,
    SystemPolicy,
    AutomationRule,
    DerivedToolResult,
    UntrustedSource,
    ExternalSignal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityDescriptor {
    pub action: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceScope {
    pub kind: String,
    pub identifier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActionContext {
    pub origin: RequestOrigin,
    pub authority: RequestAuthority,
    pub capability: CapabilityDescriptor,
    pub scope: ResourceScope,
    pub provider_tool_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorizationDecision {
    pub level: PermissionLevel,
    pub decision: PermissionDecision,
    pub source: String,
    pub permission: PermissionEvaluation,
    pub context: ActionContext,
}

pub fn build_action_context(
    server_name: &str,
    tool: &McpTool,
    provider_tool_name: Option<String>,
    origin: RequestOrigin,
    authority: RequestAuthority,
) -> ActionContext {
    let capability = CapabilityDescriptor {
        action: extract_metadata_string(tool, &["helpex", "action"])
            .or_else(|| extract_metadata_string(tool, &["action"]))
            .unwrap_or_else(|| tool.name.clone()),
        target: extract_metadata_string(tool, &["helpex", "target"])
            .or_else(|| extract_metadata_string(tool, &["target"]))
            .unwrap_or_else(|| format!("{}/{}", server_name, tool.name)),
    };

    let scope = ResourceScope {
        kind: extract_metadata_string(tool, &["helpex", "scope", "kind"])
            .unwrap_or_else(|| "tool".to_string()),
        identifier: extract_metadata_string(tool, &["helpex", "scope", "identifier"])
            .or_else(|| extract_metadata_string(tool, &["helpex", "scope"]))
            .unwrap_or_else(|| format!("{}/{}", server_name, tool.name)),
    };

    ActionContext {
        origin,
        authority,
        capability,
        scope,
        provider_tool_name,
    }
}

pub fn authorize_request(
    policy: &PermissionPolicy,
    server_name: &str,
    tool: &McpTool,
    context: ActionContext,
) -> AuthorizationDecision {
    let permission = evaluate_permission(policy, server_name, tool);
    let guarded_decision = match context.origin {
        RequestOrigin::DirectUser | RequestOrigin::System => permission.decision,
        RequestOrigin::Automation => {
            if permission.level == PermissionLevel::Sensitive {
                PermissionDecision::Deny
            } else {
                permission.decision
            }
        }
        RequestOrigin::ToolResult
        | RequestOrigin::UntrustedContent
        | RequestOrigin::ExternalEvent => match permission.level {
            PermissionLevel::Read => permission.decision,
            PermissionLevel::Unknown => PermissionDecision::Ask,
            PermissionLevel::Write
            | PermissionLevel::Execute
            | PermissionLevel::Sensitive => PermissionDecision::Deny,
        },
    };

    let source = if guarded_decision != permission.decision {
        "origin_guard".to_string()
    } else {
        permission.source.clone()
    };

    AuthorizationDecision {
        level: permission.level,
        decision: guarded_decision,
        source,
        permission: PermissionEvaluation {
            level: permission.level,
            decision: guarded_decision,
            source: permission.source,
        },
        context,
    }
}

fn extract_metadata_string(tool: &McpTool, path: &[&str]) -> Option<String> {
    tool.annotations
        .as_ref()
        .and_then(|value| extract_nested_string(value, path))
        .or_else(|| {
            tool.metadata
                .as_ref()
                .and_then(|value| extract_nested_string(value, path))
        })
}

fn extract_nested_string(value: &serde_json::Value, path: &[&str]) -> Option<String> {
    let mut cursor = value;
    for key in path {
        cursor = cursor.get(*key)?;
    }
    cursor.as_str().map(ToString::to_string)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::mcp::permissions::PermissionDecisionMatrix;

    fn tool(level: &str) -> McpTool {
        McpTool {
            name: "restart".to_string(),
            description: Some("Restart Plex Container".to_string()),
            input_schema: json!({"type": "object"}),
            annotations: Some(json!({
                "helpexPermissionLevel": level,
                "helpex": {
                    "action": "service.restart",
                    "target": "proxmox/home/plex",
                    "scope": {
                        "kind": "container",
                        "identifier": "plex"
                    }
                }
            })),
            metadata: None,
        }
    }

    #[test]
    fn untrusted_origin_cannot_inherit_write_authority() {
        let decision = authorize_request(
            &PermissionPolicy {
                default_decisions: PermissionDecisionMatrix::default(),
                server_rules: Vec::new(),
                tool_rules: Vec::new(),
            },
            "ops",
            &tool("execute"),
            build_action_context(
                "ops",
                &tool("execute"),
                Some("mcp_ops_restart".to_string()),
                RequestOrigin::UntrustedContent,
                RequestAuthority::UntrustedSource,
            ),
        );

        assert_eq!(decision.decision, PermissionDecision::Deny);
        assert_eq!(decision.source, "origin_guard");
        assert_eq!(decision.context.capability.action, "service.restart");
        assert_eq!(decision.context.scope.identifier, "plex");
    }
}
