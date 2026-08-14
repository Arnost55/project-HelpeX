import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import { useChatStore } from "../store/chatStore";
import { useSettingsStore } from "../store/settingsStore";
import { useIncognitoStore } from "../store/incognitoStore";
import { createId } from "../utils/id";
import { saveConversation, saveMessage } from "../api/tauriDb";
import { estimateConversationTokens } from "../utils/tokens";
import { validateProviderSettings } from "../utils/providerValidation";
import { useMcp } from "../hooks/useMcp";
import { transformMcpTools, parseProviderToolCalls } from "../utils/llmProviders";
import type { LlmProvider } from "../utils/llmProviders";
import { Square, Wifi, WifiOff, Layers, Cpu, Hash, AlertTriangle, Eye, EyeOff, Trash2, MessageSquarePlus } from "lucide-react";

interface StreamChunkEvent {
  streamId: string;
  token: string;
}

interface StreamDoneEvent {
  streamId: string;
}

interface StreamErrorEvent {
  streamId: string;
  message: string;
}

interface StreamProviderEvent {
  streamId: string;
  provider: string;
  model: string;
  fallbackUsed: boolean;
}

interface AgentToolEvent {
  streamId: string;
  serverName: string;
  toolName: string;
  summary?: string | null;
  durationMs?: number | null;
  permissionDecision?: string | null;
}

interface ToolActivity {
  key: string;
  label: string;
  status: "running" | "success" | "error";
  summary?: string;
}

function isKnownProvider(value: string): value is "openai" | "claude" | "ollama" | "groq" | "together" {
  return value === "openai" || value === "claude" || value === "ollama" || value === "groq" || value === "together";
}

export default function ChatPanel(props: { onNavigate?: (tab: "chat" | "settings", section?: string) => void; onNewChat?: () => void }): JSX.Element {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const addMessage = useChatStore((state) => state.addMessage);
  const appendAssistantToken = useChatStore((state) => state.appendAssistantToken);
  const createConversation = useChatStore((state) => state.createConversation);
  const startStreaming = useChatStore((state) => state.startStreaming);
  const stopStreaming = useChatStore((state) => state.stopStreaming);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const provider = useSettingsStore((state) => state.provider);
  const apiKey = useSettingsStore((state) => state.openAiApiKey);
  const claudeApiKey = useSettingsStore((state) => state.claudeApiKey);
  const groqApiKey = useSettingsStore((state) => state.groqApiKey);
  const togetherApiKey = useSettingsStore((state) => state.togetherApiKey);
  const ollamaBaseUrl = useSettingsStore((state) => state.ollamaBaseUrl);
  const groqBaseUrl = useSettingsStore((state) => state.groqBaseUrl);
  const togetherBaseUrl = useSettingsStore((state) => state.togetherBaseUrl);
  const model = useSettingsStore((state) => state.model);
  const fallbackProvider = useSettingsStore((state) => state.fallbackProvider);
  const fallbackModel = useSettingsStore((state) => state.fallbackModel);
  const temperature = useSettingsStore((state) => state.temperature);
  const maxTokens = useSettingsStore((state) => state.maxTokens);
  const markProviderSuccess = useSettingsStore((state) => state.markProviderSuccess);
  const markProviderFailure = useSettingsStore((state) => state.markProviderFailure);
  const providerHealth = useSettingsStore((state) => state.providerHealth);
  const isIncognito = useIncognitoStore((state) => state.isIncognito);
  const setIncognito = useIncognitoStore((state) => state.setIncognito);
  const toggleIncognito = useIncognitoStore((state) => state.toggleIncognito);
  const [error, setError] = useState<string | null>(null);
  const [incognitoConfirmOpen, setIncognitoConfirmOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [activeStreamProvider, setActiveStreamProvider] = useState<string | null>(null);
  const [activeFallbackUsed, setActiveFallbackUsed] = useState(false);
  const { activeServers, executeTool } = useMcp();
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);

  const activeConversation = useMemo(() => {
    if (activeConversationId) {
      return conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
    }
    return conversations[0] ?? null;
  }, [activeConversationId, conversations]);

  const conversationTokenEstimate = useMemo(() => {
    if (!activeConversation) return 0;
    return estimateConversationTokens(activeConversation.messages);
  }, [activeConversation]);

  useEffect(() => {
    if (activeConversation && !activeConversationId) {
      setActiveConversation(activeConversation.id);
    }
  }, [activeConversation, activeConversationId, setActiveConversation]);

  useEffect(() => {
    if (!activeConversation) return;
    if (activeConversation.messages.length > 0) return;
    if (activeConversation.isIncognito === isIncognito) return;
    const conversations = useChatStore.getState().conversations;
    useChatStore.setState({
      conversations: conversations.map((conversation) =>
        conversation.id === activeConversation.id
          ? { ...conversation, isIncognito }
          : conversation
      )
    });
  }, [activeConversation, isIncognito]);

  useEffect(() => {
    return () => {
      if (activeStreamId) {
        void invoke("cancel_chat_stream", { stream_id: activeStreamId });
      }
    };
  }, [activeStreamId]);

  const toggleLocked = activeConversation ? activeConversation.messages.length > 0 : false;

  function handleToggleIncognito(): void {
    if (isIncognito) {
      if (activeConversation && activeConversation.messages.length > 0) {
        setIncognitoConfirmOpen(true);
      } else {
        setIncognito(false);
      }
    } else {
      if (toggleLocked) return;
      setIncognito(true);
      if (!activeConversation || activeConversation.messages.length > 0) {
        createConversation();
      }
    }
  }

  async function wipeSession(): Promise<void> {
    console.log(`[ChatPanel.wipeSession] Starting wipe — isIncognito=${isIncognito}`);
    if (isIncognito) {
      try {
        await invoke("wipe_incognito_session");
        console.log("[ChatPanel.wipeSession] Incognito partition wiped successfully");
      } catch (e) {
        console.error("[ChatPanel.wipeSession] Incognito wipe failed:", e);
      }
      useChatStore.getState().removeIncognitoConversations();
      useIncognitoStore.persist.clearStorage();
      useIncognitoStore.getState().setIncognito(false);
    } else {
      try {
        await invoke("wipe_all_data");
        console.log("[ChatPanel.wipeSession] All data wiped successfully");
      } catch (e) {
        console.error("[ChatPanel.wipeSession] Wipe failed:", e);
      }
      useChatStore.persist.clearStorage();
      useIncognitoStore.persist.clearStorage();
      useChatStore.getState().wipeChat();
    }
    setIncognitoConfirmOpen(false);
    setError(null);
    setSessionKey((n) => n + 1);
  }

  async function handleMCPChat(text: string): Promise<void> {
    if (!activeConversation) return;
    if (!useChatStore.getState().activeConversationId) return;

    const mcpProvider: LlmProvider =
      provider === "claude" ? "claude"
      : provider === "ollama" ? "ollama"
      : "openai";

    const activeToolsCount = Object.values(activeServers).flat().length;
    if (activeToolsCount === 0) {
      return handleSend(text);
    }

    const formattedTools = transformMcpTools(activeServers, mcpProvider);

    if (formattedTools.length === 0) {
      console.warn("⚠️ [JARVIS Core] No active MCP tools found in state. AI will default to text-only mode.");
    }

    const jarvisSystemCore = {
      role: "system",
      content: `You are JARVIS, an advanced, elite desktop engineering assistant running locally on the user's machine.
CRITICAL MANDATE: You possess real-time hardware capabilities via the Model Context Protocol (MCP). 
Do NOT claim you lack file system or local workspace access. Use your available tools to fulfill user requests automatically. Proceed with absolute technical authority.`
    };

    const localizedMessages = [
      jarvisSystemCore,
      ...activeConversation.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: text }
    ];

    let endpointUrl = "http://localhost:11434/v1/chat/completions";
    let headers: Record<string, string> = { "Content-Type": "application/json" };
    let payload: any = {};

    if (mcpProvider === "openai") {
      endpointUrl = "https://api.openai.com/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey.trim()}`;
      payload = {
        model,
        messages: localizedMessages,
        tools: formattedTools.length > 0 ? formattedTools : undefined,
      };
    } else if (mcpProvider === "claude") {
      endpointUrl = "https://api.anthropic.com/v1/messages";
      headers["x-api-key"] = claudeApiKey.trim();
      headers["anthropic-version"] = "2023-06-01";
      payload = {
        model,
        max_tokens: maxTokens,
        messages: localizedMessages,
        tools: formattedTools.length > 0 ? formattedTools : undefined,
      };
    } else if (mcpProvider === "ollama") {
      endpointUrl = "http://localhost:11434/v1/chat/completions";
      payload = {
        model,
        messages: localizedMessages,
        tools: formattedTools.length > 0 ? formattedTools : undefined,
        stream: false,
      };
    }

    console.log("🚀 [Engine Outbound] Dispatched payload via OpenAI compatibility format:", JSON.stringify(payload, null, 2));

    setError(null);
    addMessage(activeConversation.id, {
      id: createId("msg"),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
      conversationId: activeConversation.id,
    });

    startStreaming();

    try {
      console.log(`[MCP Chat] Sending to ${mcpProvider} with ${Object.keys(activeServers).length} tool servers`);
      const response = await fetch(endpointUrl, { method: "POST", headers, body: JSON.stringify(payload) });
      if (!response.ok) {
        const errText = await response.text().catch(() => "Unknown error");
        throw new Error(`Provider returned ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const toolCalls = parseProviderToolCalls(data, mcpProvider);

      if (toolCalls.length > 0) {
        console.log(`[MCP Chat] Executing ${toolCalls.length} tool calls from AI...`);
        for (const call of toolCalls) {
          const result = await executeTool(call.serverName, call.toolName, call.arguments);
          console.log(`[MCP Chat] Tool ${call.serverName}__${call.toolName} result:`, result);
          addMessage(activeConversation.id, {
            id: createId("msg"),
            role: "assistant" as const,
            content: `[Tool call: ${call.toolName} from ${call.serverName}]\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
            createdAt: new Date().toISOString(),
            conversationId: activeConversation.id,
          });
        }
      } else {
        const finalText = mcpProvider === "claude"
          ? data.content?.[0]?.text ?? JSON.stringify(data)
          : data.choices?.[0]?.message?.content ?? JSON.stringify(data);
        addMessage(activeConversation.id, {
          id: createId("msg"),
          role: "assistant",
          content: finalText,
          createdAt: new Date().toISOString(),
          conversationId: activeConversation.id,
        });
      }

      markProviderSuccess(provider, false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "MCP chat failed";
      setError(message);
      markProviderFailure(provider);
    } finally {
      stopStreaming();
    }
  }

  async function handleSend(text: string, systemPromptOverride?: string): Promise<void> {
    if (!activeConversation) return;
    if (!useChatStore.getState().activeConversationId) return;

    const validationIssues = validateProviderSettings({
      provider,
      openAiApiKey: apiKey,
      claudeApiKey,
      groqApiKey,
      togetherApiKey,
      ollamaBaseUrl,
      groqBaseUrl,
      togetherBaseUrl,
      model,
      fallbackProvider,
      fallbackModel
    });

    if (validationIssues.length > 0) {
      const firstIssue = validationIssues[0];
      setError(firstIssue);
      throw new Error(firstIssue);
    }

    setError(null);

    addMessage(activeConversation.id, {
      id: createId("msg"),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
      conversationId: activeConversation.id
    });

    try {
      setToolActivities([]);
      const streamId = createId("stream");
      setActiveStreamId(streamId);
      setActiveStreamProvider(null);
      setActiveFallbackUsed(false);
      let streamProviderKey: "openai" | "claude" | "ollama" | "groq" | "together" = provider;
      let fallbackWasUsed = false;

      const refreshedConvo = useChatStore
        .getState()
        .conversations.find((conversation) => conversation.id === activeConversation.id);

      if (refreshedConvo && !isIncognito && !useChatStore.getState().cleaningUp) {
        console.log(`[ChatPanel] Saving initial conversation ${refreshedConvo.id} (isIncognito=${isIncognito})`);
        await saveConversation(refreshedConvo);
        const latestUserMessage = refreshedConvo.messages[refreshedConvo.messages.length - 1];
        if (latestUserMessage) {
          await saveMessage({ ...latestUserMessage, conversationId: refreshedConvo.id });
        }
      }

      startStreaming();
      const latestConversation =
        useChatStore
          .getState()
          .conversations.find((conversation) => conversation.id === activeConversation.id) ?? activeConversation;

      const streamCompletion = new Promise<void>(async (resolve, reject) => {
        let settled = false;
        let unlistenChunk: () => void = () => {};
        let unlistenDone: () => void = () => {};
        let unlistenError: () => void = () => {};
        let unlistenProvider: () => void = () => {};
        let unlistenToolStart: () => void = () => {};
        let unlistenToolResult: () => void = () => {};
        let unlistenToolError: () => void = () => {};

        const cleanup = () => {
          unlistenChunk();
          unlistenDone();
          unlistenError();
          unlistenProvider();
          unlistenToolStart();
          unlistenToolResult();
          unlistenToolError();
        };

        const resolveOnce = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        };

        const rejectOnce = (error: Error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        };

        unlistenChunk = await listen<StreamChunkEvent>("chat-stream-chunk", (event) => {
          if (event.payload.streamId !== streamId) return;
          appendAssistantToken(activeConversation.id, event.payload.token);
        });

        unlistenDone = await listen<StreamDoneEvent>("chat-stream-done", (event) => {
          if (event.payload.streamId !== streamId) return;
          resolveOnce();
        });

        unlistenError = await listen<StreamErrorEvent>("chat-stream-error", (event) => {
          if (event.payload.streamId !== streamId) return;
          rejectOnce(new Error(event.payload.message));
        });

        unlistenProvider = await listen<StreamProviderEvent>("chat-stream-provider", (event) => {
          if (event.payload.streamId !== streamId) return;
          const providerLabel = event.payload.fallbackUsed
            ? `${event.payload.provider} (fallback)`
            : event.payload.provider;
          if (isKnownProvider(event.payload.provider)) {
            streamProviderKey = event.payload.provider;
          }
          fallbackWasUsed = event.payload.fallbackUsed;
          setActiveFallbackUsed(event.payload.fallbackUsed);
          setActiveStreamProvider(`${providerLabel} • ${event.payload.model}`);
        });

        unlistenToolStart = await listen<AgentToolEvent>("agent-tool-start", (event) => {
          if (event.payload.streamId !== streamId) return;
          const key = `${event.payload.serverName}::${event.payload.toolName}`;
          setToolActivities((current) => {
            const next = current.filter((item) => item.key !== key);
            next.push({
              key,
              label: `${event.payload.serverName} • ${event.payload.toolName}`,
              status: "running"
            });
            return next;
          });
        });

        unlistenToolResult = await listen<AgentToolEvent>("agent-tool-result", (event) => {
          if (event.payload.streamId !== streamId) return;
          const key = `${event.payload.serverName}::${event.payload.toolName}`;
          setToolActivities((current) => {
            const next = current.filter((item) => item.key !== key);
            next.push({
              key,
              label: `${event.payload.serverName} • ${event.payload.toolName}`,
              status: "success",
              summary: event.payload.summary ?? undefined
            });
            return next;
          });
        });

        unlistenToolError = await listen<AgentToolEvent>("agent-tool-error", (event) => {
          if (event.payload.streamId !== streamId) return;
          const key = `${event.payload.serverName}::${event.payload.toolName}`;
          setToolActivities((current) => {
            const next = current.filter((item) => item.key !== key);
            next.push({
              key,
              label: `${event.payload.serverName} • ${event.payload.toolName}`,
              status: "error",
              summary: event.payload.summary ?? undefined
            });
            return next;
          });
        });

        try {
          await invoke("stream_chat", {
            request: {
              streamId,
              provider,
              model,
              apiKey:
                provider === "openai"
                  ? apiKey.trim()
                  : provider === "claude"
                    ? claudeApiKey.trim()
                    : provider === "groq"
                      ? groqApiKey.trim()
                      : provider === "together"
                        ? togetherApiKey.trim()
                        : undefined,
              baseUrl:
                provider === "ollama"
                  ? ollamaBaseUrl.trim()
                  : provider === "groq"
                    ? groqBaseUrl.trim()
                    : provider === "together"
                      ? togetherBaseUrl.trim()
                      : undefined,
              temperature,
              maxTokens,
              fallbackProvider: fallbackProvider === "none" ? undefined : fallbackProvider,
              fallbackModel: fallbackProvider === "none" ? undefined : fallbackModel,
              fallbackApiKey:
                fallbackProvider === "openai"
                  ? apiKey.trim()
                  : fallbackProvider === "claude"
                    ? claudeApiKey.trim()
                    : fallbackProvider === "groq"
                      ? groqApiKey.trim()
                      : fallbackProvider === "together"
                        ? togetherApiKey.trim()
                        : undefined,
              fallbackBaseUrl:
                fallbackProvider === "ollama"
                  ? ollamaBaseUrl.trim()
                  : fallbackProvider === "groq"
                    ? groqBaseUrl.trim()
                    : fallbackProvider === "together"
                      ? togetherBaseUrl.trim()
                      : undefined,
              messages: systemPromptOverride
                ? [{ role: "system", content: systemPromptOverride }, ...latestConversation.messages.map((message) => ({
                    role: message.role,
                    content: message.content
                  }))]
                : latestConversation.messages.map((message) => ({
                    role: message.role,
                    content: message.content
                  }))
            }
          });
        } catch (invokeError) {
          rejectOnce(invokeError instanceof Error ? invokeError : new Error("Failed to start stream"));
        }
      });

      await streamCompletion;

      const postStreamConvo = useChatStore
        .getState()
        .conversations.find((conversation) => conversation.id === activeConversation.id);

      if (postStreamConvo && !isIncognito && !useChatStore.getState().cleaningUp) {
        console.log(`[ChatPanel] Saving post-stream conversation ${postStreamConvo.id} (isIncognito=${isIncognito})`);
        await saveConversation(postStreamConvo);
        const latestAssistant = postStreamConvo.messages[postStreamConvo.messages.length - 1];
        if (latestAssistant && latestAssistant.role === "assistant") {
          await saveMessage({ ...latestAssistant, conversationId: postStreamConvo.id });
        }
      }

      markProviderSuccess(streamProviderKey, fallbackWasUsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      const postErrorConvo = useChatStore
        .getState()
        .conversations.find((conversation) => conversation.id === activeConversation.id);
      if (postErrorConvo && !isIncognito && !useChatStore.getState().cleaningUp) {
        console.log(`[ChatPanel] Saving post-error conversation ${postErrorConvo.id} (isIncognito=${isIncognito})`);
        await saveConversation(postErrorConvo);
        const latestAssistant = postErrorConvo.messages[postErrorConvo.messages.length - 1];
        if (latestAssistant && latestAssistant.role === "assistant") {
          await saveMessage({ ...latestAssistant, conversationId: postErrorConvo.id });
        }
      }
      markProviderFailure(provider);
    } finally {
      setActiveStreamId(null);
      setActiveStreamProvider(null);
      setActiveFallbackUsed(false);
      stopStreaming();
    }
  }

  function handleStop(): void {
    if (!activeStreamId) return;
    setError("Generation stopped.");
    void invoke("cancel_chat_stream", { stream_id: activeStreamId });
  }

  const healthOk = providerHealth[provider]?.healthy;

  return (
    <section key={sessionKey} className="flex flex-col h-full overflow-hidden">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border-panel)', backgroundColor: 'var(--bg-panel)' }}>
        <div className="flex items-center gap-4 min-w-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {activeConversation?.title ?? "No conversation"}
            </h2>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <Cpu size={10} />
                {provider}
              </span>
              <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <Layers size={10} />
                {model}
              </span>
              <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <Hash size={10} />
                {conversationTokenEstimate} tok
              </span>
              {activeStreamProvider && (
                <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--accent-glow)' }}>
                  <Wifi size={10} className="animate-pulse" />
                  {activeStreamProvider}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isIncognito && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-semibold" style={{ backgroundColor: 'rgba(56, 189, 248, 0.08)', color: 'var(--accent-secondary)', border: '1px solid rgba(56, 189, 248, 0.15)' }}>
              <EyeOff size={10} />
              Private Session
            </span>
          )}
          {activeFallbackUsed && (
            <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded" style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
              <AlertTriangle size={10} />
              Fallback active
            </span>
          )}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px]" style={{
            backgroundColor: healthOk ? 'rgba(0, 245, 184, 0.06)' : 'var(--bg-field)',
            color: healthOk ? 'var(--accent-glow)' : 'var(--text-muted)',
            border: healthOk ? '1px solid rgba(0, 245, 184, 0.15)' : '1px solid var(--border-subtle)',
          }}>
            {healthOk ? <Wifi size={10} /> : <WifiOff size={10} />}
            {healthOk ? 'Connected' : 'No signal'}
          </div>
          <button
            onClick={handleToggleIncognito}
            disabled={!isIncognito && toggleLocked}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all duration-200"
            style={{
              backgroundColor: isIncognito ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
              color: isIncognito ? 'var(--accent-secondary)' : 'var(--text-muted)',
              border: isIncognito ? '1px solid rgba(56, 189, 248, 0.15)' : '1px solid var(--border-subtle)',
              cursor: !isIncognito && toggleLocked ? 'not-allowed' : 'pointer',
              opacity: !isIncognito && toggleLocked ? 0.4 : 1,
            }}
            onMouseEnter={(e) => {
              if (isIncognito || (!isIncognito && toggleLocked)) return;
              e.currentTarget.style.color = 'var(--accent-secondary)';
              e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.3)';
            }}
            onMouseLeave={(e) => {
              if (isIncognito || (!isIncognito && toggleLocked)) return;
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
            }}
            title={
              !isIncognito && toggleLocked
                ? "Start a New Chat to enable Privacy Mode."
                : isIncognito
                  ? "Disable Incognito Mode"
                  : "Enable Incognito Mode"
            }
          >
            {isIncognito ? <EyeOff size={10} /> : <Eye size={10} />}
            {isIncognito ? 'Incognito' : 'Privacy'}
          </button>
          {!isIncognito && toggleLocked && (
            <span className="flex items-center gap-1 text-[10px] max-w-[140px] leading-tight" style={{ color: 'var(--text-muted)' }}>
              <MessageSquarePlus size={10} className="flex-shrink-0" style={{ color: 'var(--accent-glow)' }} />
              New Chat to enable
            </span>
          )}
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-soft)', border: '1px solid rgba(255, 51, 85, 0.2)' }}
            >
              <Square size={12} />
              Stop
            </button>
          ) : null}
        </div>
      </header>

      {/* Error */}
      {error ? (
        <div className="mx-5 mt-3 px-4 py-2.5 rounded-lg flex items-center gap-2" style={{ backgroundColor: 'var(--danger-soft)', border: '1px solid rgba(255, 51, 85, 0.15)' }}>
          <AlertTriangle size={14} style={{ color: 'var(--danger)' }} className="flex-shrink-0" />
          <span className="text-xs" style={{ color: 'var(--danger)' }}>{error}</span>
        </div>
      ) : null}

      {toolActivities.length > 0 ? (
        <div className="mx-5 mt-3 rounded-lg px-4 py-3" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-panel)' }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            Agent Actions
          </div>
          <div className="space-y-2">
            {toolActivities.map((activity) => (
              <div key={activity.key} className="flex items-start gap-2 text-xs">
                <span style={{ color: activity.status === "error" ? 'var(--danger)' : activity.status === "success" ? 'var(--accent-glow)' : 'var(--text-muted)' }}>
                  {activity.status === "running" ? "…" : activity.status === "success" ? "✓" : "!"}
                </span>
                <div className="min-w-0">
                  <div style={{ color: 'var(--text-primary)' }}>{activity.label}</div>
                  {activity.summary ? (
                    <div className="truncate" style={{ color: 'var(--text-muted)' }}>{activity.summary}</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Messages */}
      {activeConversation && activeConversation.messages.length > 0 ? (
        <>
          <MessageList messages={activeConversation.messages} isStreaming={isStreaming} />
          <MessageInput disabled={isStreaming} onSubmit={handleSend} />
        </>
      ) : (
        <>
          <MessageInput disabled={isStreaming} onSubmit={(t) => handleSend(t)} />
        </>
      )}

      {/* Incognito Confirmation Dialog */}
      {incognitoConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="max-w-sm w-full mx-4 p-6 rounded-xl" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-panel)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.15)' }}>
                <EyeOff size={18} style={{ color: 'var(--accent-secondary)' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>End Private Session?</h3>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>This will wipe the current session</p>
              </div>
            </div>
            <p className="text-xs mb-5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Turning off incognito mode will clear all messages from the current conversation
              and start a fresh session. No history will be saved from this session.
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setIncognitoConfirmOpen(false)}
                className="cyber-btn cyber-btn-ghost text-xs"
              >
                Cancel
              </button>
              <button
                onClick={wipeSession}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: 'var(--danger)', color: '#fff', border: 'none' }}
              >
                <Trash2 size={12} />
                Wipe & Disable
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
