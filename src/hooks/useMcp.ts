import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  deleteMcpServer,
  listMcpServers,
  restartMcpServer,
  setMcpServerEnabled,
  setMcpToolEnabled,
  upsertMcpServer,
} from "../api/mcp";
import type { McpServerConfigInput, McpServerView, McpToolView } from "../types/mcp";

export const useMcp = () => {
  const [servers, setServers] = useState<McpServerView[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshServers = useCallback(async () => {
    try {
      const next = await listMcpServers();
      setServers(next);
      setError(null);
      return next;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : typeof err === "string" ? err : "Failed to load MCP servers";
      setError(message);
      return [];
    }
  }, []);

  const activeServers = useMemo<Record<string, McpToolView[]>>(
    () =>
      Object.fromEntries(
        servers
          .filter((server) => server.status === "CONNECTED")
          .map((server) => [server.name, server.tools.filter((tool) => tool.enabled)]),
      ),
    [servers],
  );

  const saveServer = useCallback(
    async (config: McpServerConfigInput) => {
      setIsLoading(true);
      try {
        const updated = await upsertMcpServer(config);
        setServers((current) => {
          const next = current.filter((server) => server.name !== updated.name);
          next.push(updated);
          next.sort((left, right) => left.name.localeCompare(right.name));
          return next;
        });
        setError(null);
        return updated;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : typeof err === "string" ? err : "Failed to save MCP server";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const removeServer = useCallback(async (name: string) => {
    setIsLoading(true);
    try {
      await deleteMcpServer(name);
      setServers((current) => current.filter((server) => server.name !== name));
      setError(null);
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : typeof err === "string" ? err : "Failed to delete MCP server";
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnectServer = useCallback(async (name: string) => {
    setIsLoading(true);
    try {
      await invoke("mcp_disconnect_server", { name });
      await refreshServers();
      setError(null);
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : typeof err === "string" ? err : "Failed to disconnect MCP server";
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [refreshServers]);

  const toggleServerEnabled = useCallback(async (name: string, enabled: boolean) => {
    setIsLoading(true);
    try {
      const updated = await setMcpServerEnabled(name, enabled);
      setServers((current) => current.map((server) => (server.name === name ? updated : server)));
      setError(null);
      return updated;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleToolEnabled = useCallback(
    async (serverName: string, toolName: string, enabled: boolean) => {
      setIsLoading(true);
      try {
        const updated = await setMcpToolEnabled(serverName, toolName, enabled);
        setServers((current) =>
          current.map((server) => (server.name === serverName ? updated : server)),
        );
        setError(null);
        return updated;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const restartServer = useCallback(async (name: string) => {
    setIsLoading(true);
    try {
      const updated = await restartMcpServer(name);
      setServers((current) => current.map((server) => (server.name === name ? updated : server)));
      setError(null);
      return updated;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const executeTool = useCallback(async (serverName: string, toolName: string, args: unknown) => {
    return invoke("mcp_execute_tool", { serverName, toolName, arguments: args });
  }, []);

  const respondToPermissionRequest = useCallback(async (approvalId: string, allow: boolean) => {
    await invoke("mcp_respond_to_permission_request", { approvalId, allow });
  }, []);

  useEffect(() => {
    void invoke("mcp_hydrate_saved_servers")
      .catch(() => undefined)
      .finally(() => {
        void refreshServers();
      });
  }, [refreshServers]);

  return {
    servers,
    activeServers,
    isLoading,
    error,
    refreshServers,
    saveServer,
    removeServer,
    disconnectServer,
    toggleServerEnabled,
    toggleToolEnabled,
    restartServer,
    executeTool,
    respondToPermissionRequest,
  };
};
