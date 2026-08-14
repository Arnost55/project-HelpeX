import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface McpToolProperty {
    type: string;
    description?: string;
}

export interface McpTool {
    name: string;
    description?: string;
    input_schema: {
        type: string;
        properties: Record<string, McpToolProperty>;
        required?: string[];
    };
}

export const useMcp = () => {
    const [activeServers, setActiveServers] = useState<Record<string, McpTool[]>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refreshActiveTools = useCallback(async () => {
        try {
            const data = await invoke<Record<string, McpTool[]>>("mcp_get_active_tools");
            setActiveServers(data);
        } catch (err: unknown) {
            console.error("Failed to query runtime active tool profiles:", err);
        }
    }, []);

    const registerNewNode = async (name: string, cmd: string, argsStr: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const args = argsStr.split(" ").filter(a => a.trim() !== "");
            console.log(`📡 [MCP Hook] Dispatching initialization frame for server node [${name}]`);

            await invoke("mcp_spawn_and_initialize", { name, cmd, args });
            await refreshActiveTools();
            return true;
        } catch (err: unknown) {
            const parsedError = typeof err === "string" ? err : (err as Error)?.message || JSON.stringify(err);
            setError(parsedError);
            console.error(`❌ [MCP Hook] Spawning pipeline crashed: ${parsedError}`);
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    const executeTool = async (serverName: string, toolName: string, args: any): Promise<any> => {
        try {
            console.log(`⚡ [MCP Hook] Executing ${serverName}__${toolName} with args:`, args);
            return await invoke("mcp_execute_tool", { serverName, toolName, arguments: args });
        } catch (err: unknown) {
            const parsedError = typeof err === "string" ? err : (err as Error)?.message || JSON.stringify(err);
            console.error(`❌ [MCP Hook] Tool execution failed for ${serverName}__${toolName}: ${parsedError}`);
            throw err;
        }
    };

    const removeNode = async (name: string) => {
        try {
            console.log(`🔌 [MCP Hook] Requesting backend termination for node: ${name}`);
            await invoke("mcp_disconnect_server", { name });
            await refreshActiveTools();
            return true;
        } catch (err: any) {
            console.error(`❌ [MCP Hook] Failed to gracefully disconnect node [${name}]:`, err);
            return false;
        }
    };

    useEffect(() => {
        const bootstrapServers = async () => {
            try {
                await invoke("mcp_hydrate_saved_servers");
                await refreshActiveTools();
            } catch (e) {
                console.error("Auto-boot handshake routing failure:", e);
            }
        };
        bootstrapServers();
    }, [refreshActiveTools]);

    return {
        activeServers,
        isLoading,
        error,
        registerNewNode,
        removeNode,
        refreshActiveTools,
        executeTool
    };
};
