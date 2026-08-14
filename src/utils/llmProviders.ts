import type { McpTool } from "../hooks/useMcp";

export type LlmProvider = "ollama" | "openai" | "claude";

export interface UnifiedToolCall {
  id: string;
  serverName: string;
  toolName: string;
  arguments: any;
}

export const transformMcpTools = (activeServers: Record<string, McpTool[]>, provider: LlmProvider) => {
  const openAiTools: any[] = [];
  const anthropicTools: any[] = [];

  Object.entries(activeServers).forEach(([serverName, tools]) => {
    tools.forEach((tool) => {
      const namespacedName = `${serverName}__${tool.name}`;

      if (provider === "openai" || provider === "ollama") {
        openAiTools.push({
          type: "function",
          function: {
            name: namespacedName,
            description: tool.description || "",
            parameters: {
              type: tool.input_schema.type,
              properties: tool.input_schema.properties,
              required: tool.input_schema.required || [],
            },
          },
        });
      } else if (provider === "claude") {
        anthropicTools.push({
          name: namespacedName,
          description: tool.description || "",
          input_schema: {
            type: tool.input_schema.type,
            properties: tool.input_schema.properties,
            required: tool.input_schema.required || [],
          },
        });
      }
    });
  });

  return provider === "claude" ? anthropicTools : openAiTools;
};

export const parseProviderToolCalls = (responsePayload: any, provider: LlmProvider): UnifiedToolCall[] => {
  const unifiedCalls: UnifiedToolCall[] = [];

  if (provider === "openai" || provider === "ollama") {
    const choices = responsePayload.choices?.[0];
    const toolCalls = choices?.message?.tool_calls;
    if (toolCalls) {
      toolCalls.forEach((call: any) => {
        const [serverName, toolName] = call.function.name.split("__");
        unifiedCalls.push({
          id: call.id,
          serverName,
          toolName,
          arguments: JSON.parse(call.function.arguments),
        });
      });
    }
  } else if (provider === "claude") {
    const contentBlocks = responsePayload.content || [];
    contentBlocks.forEach((block: any) => {
      if (block.type === "tool_use") {
        const [serverName, toolName] = block.name.split("__");
        unifiedCalls.push({
          id: block.id,
          serverName,
          toolName,
          arguments: block.input,
        });
      }
    });
  }

  return unifiedCalls;
};
