import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface McpToolInputSchema {
  type?: string;
  properties?: Record<string, { type?: string; description?: string }>;
  required?: string[];
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: McpToolInputSchema;
}

export function useMcp() {
  const [discoveredTools, setDiscoveredTools] = useState<McpToolDefinition[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (command: string, args: string[]) => {
    setIsLoading(true);
    setError(null);
    try {
      await invoke("mcp_connect", { command, args });
      setIsConnected(true);

      const toolsResult: unknown = await invoke("mcp_get_tools");
      const rawTools = (toolsResult as Record<string, unknown>)?.tools;
      const tools: McpToolDefinition[] = Array.isArray(rawTools) ? rawTools as McpToolDefinition[] : [];
      setDiscoveredTools(tools);
      console.log("[MCP Discovered Tools]:", tools);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error("[MCP] Connection failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const callTool = useCallback(async (name: string, args: Record<string, unknown>) => {
    return await invoke("mcp_call_tool", { name, arguments: args });
  }, []);

  return { connect, callTool, discoveredTools, isConnected, isLoading, error };
}
