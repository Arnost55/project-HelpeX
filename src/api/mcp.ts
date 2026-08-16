import { invoke } from "@tauri-apps/api/core";
import type { McpServerConfigInput, McpServerView } from "../types/mcp";

export async function listMcpServers(): Promise<McpServerView[]> {
  return invoke("mcp_list_servers");
}

export async function upsertMcpServer(config: McpServerConfigInput): Promise<McpServerView> {
  return invoke("mcp_upsert_server", { config });
}

export async function deleteMcpServer(name: string): Promise<void> {
  return invoke("mcp_delete_server", { name });
}

export async function restartMcpServer(name: string): Promise<McpServerView> {
  return invoke("mcp_restart_server", { name });
}

export async function setMcpServerEnabled(name: string, enabled: boolean): Promise<McpServerView> {
  return invoke("mcp_set_server_enabled", { name, enabled });
}

export async function setMcpToolEnabled(
  serverName: string,
  toolName: string,
  enabled: boolean,
): Promise<McpServerView> {
  return invoke("mcp_set_tool_enabled", { serverName, toolName, enabled });
}
