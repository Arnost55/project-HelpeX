import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  Eye,
  EyeOff,
  MessageSquarePlus,
  Settings,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import { useChatStore } from "../store/chatStore";
import { useSettingsStore } from "../store/settingsStore";
import { useIncognitoStore } from "../store/incognitoStore";
import { useToolApprovalStore } from "../store/toolApprovalStore";
import { createId } from "../utils/id";
import { saveConversation, saveMessage } from "../api/tauriDb";
import { estimateConversationTokens } from "../utils/tokens";
import { validateProviderSettings } from "../utils/providerValidation";
import { useMcp } from "../hooks/useMcp";
import ToolActivityList, { type ToolActivityItem } from "./chat/ToolActivityList";

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
  permissionLevel?: string | null;
}

const SUGGESTED_ACTIONS = [
  "Show security events",
  "Check server status",
  "Run system backup",
  "Turn on night mode",
];

function isKnownProvider(value: string): value is "openai" | "claude" | "ollama" | "groq" | "together" {
  return value === "openai" || value === "claude" || value === "ollama" || value === "groq" || value === "together";
}

interface ChatPanelProps {
  mode?: "full" | "compact";
  onOpenChatPage?: () => void;
  onOpenSettings?: () => void;
}

export default function ChatPanel({
  mode = "full",
  onOpenChatPage,
  onOpenSettings,
}: ChatPanelProps): JSX.Element {
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
  const markProviderFailure = useSettingsStore((state) => state.markProviderFailure);
  const markProviderSuccess = useSettingsStore((state) => state.markProviderSuccess);
  const providerHealth = useSettingsStore((state) => state.providerHealth);
  const isIncognito = useIncognitoStore((state) => state.isIncognito);
  const setIncognito = useIncognitoStore((state) => state.setIncognito);
  const [error, setError] = useState<string | null>(null);
  const [incognitoConfirmOpen, setIncognitoConfirmOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [activeStreamProvider, setActiveStreamProvider] = useState<string | null>(null);
  const [toolActivities, setToolActivities] = useState<ToolActivityItem[]>([]);
  const [busyApprovalId, setBusyApprovalId] = useState<string | null>(null);
  const pendingApprovals = useToolApprovalStore((state) => state.pending);
  const removePendingApproval = useToolApprovalStore((state) => state.removePending);
  const clearApprovalForTool = useToolApprovalStore((state) => state.clearForTool);
  const { activeServers, respondToPermissionRequest } = useMcp();

  const activeConversation = useMemo(() => {
    if (activeConversationId) {
      return conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
    }
    return conversations[0] ?? null;
  }, [activeConversationId, conversations]);

  const sortedConversations = useMemo(
    () =>
      [...conversations].sort((left, right) =>
        left.updatedAt < right.updatedAt ? 1 : left.updatedAt > right.updatedAt ? -1 : 0,
      ),
    [conversations],
  );

  const visibleMessages = useMemo(() => {
    if (!activeConversation) return [];
    return mode === "compact"
      ? activeConversation.messages.slice(-6)
      : activeConversation.messages;
  }, [activeConversation, mode]);

  const visibleApprovals = useMemo(() => {
    if (!activeStreamId) {
      return pendingApprovals;
    }
    return pendingApprovals.filter(
      (approval) => approval.streamId === activeStreamId || approval.streamId == null,
    );
  }, [activeStreamId, pendingApprovals]);

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
    const currentConversations = useChatStore.getState().conversations;
    useChatStore.setState({
      conversations: currentConversations.map((conversation) =>
        conversation.id === activeConversation.id
          ? { ...conversation, isIncognito }
          : conversation,
      ),
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
      return;
    }

    if (toggleLocked) return;
    setIncognito(true);
    if (!activeConversation || activeConversation.messages.length > 0) {
      createConversation();
    }
  }

  async function wipeSession(): Promise<void> {
    if (isIncognito) {
      try {
        await invoke("wipe_incognito_session");
      } catch (wipeError) {
        console.error("[ChatPanel] Incognito wipe failed:", wipeError);
      }
      useChatStore.getState().removeIncognitoConversations();
      useIncognitoStore.persist.clearStorage();
      useIncognitoStore.getState().setIncognito(false);
    } else {
      try {
        await invoke("wipe_all_data");
      } catch (wipeError) {
        console.error("[ChatPanel] Data wipe failed:", wipeError);
      }
      useChatStore.persist.clearStorage();
      useIncognitoStore.persist.clearStorage();
      useChatStore.getState().wipeChat();
    }

    setIncognitoConfirmOpen(false);
    setError(null);
    setSessionKey((current) => current + 1);
  }

  function cancelActiveStream(): void {
    if (!activeStreamId) return;
    void invoke("cancel_chat_stream", { stream_id: activeStreamId });
  }

  async function handleApprovalDecision(requestId: string, allow: boolean): Promise<void> {
    try {
      setBusyApprovalId(requestId);
      await respondToPermissionRequest(requestId, allow);
      removePendingApproval(requestId);
    } catch (approvalError) {
      const message = approvalError instanceof Error ? approvalError.message : "Approval update failed";
      setError(message);
    } finally {
      setBusyApprovalId(null);
    }
  }

  async function handleSend(text: string): Promise<void> {
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
      fallbackModel,
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
      conversationId: activeConversation.id,
    });

    try {
      setToolActivities([]);
      const streamId = createId("stream");
      setActiveStreamId(streamId);
      setActiveStreamProvider(null);
      let streamProviderKey: "openai" | "claude" | "ollama" | "groq" | "together" = provider;
      let fallbackUsed = false;

      const refreshedConversation = useChatStore
        .getState()
        .conversations.find((conversation) => conversation.id === activeConversation.id);

      if (refreshedConversation && !isIncognito && !useChatStore.getState().cleaningUp) {
        await saveConversation(refreshedConversation);
        const latestUserMessage = refreshedConversation.messages[refreshedConversation.messages.length - 1];
        if (latestUserMessage) {
          await saveMessage({ ...latestUserMessage, conversationId: refreshedConversation.id });
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

        const rejectOnce = (streamError: Error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(streamError);
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
          fallbackUsed = event.payload.fallbackUsed;
          setActiveStreamProvider(`${providerLabel} • ${event.payload.model}`);
        });

        unlistenToolStart = await listen<AgentToolEvent>("agent-tool-start", (event) => {
          if (event.payload.streamId !== streamId) return;
          const key = `${event.payload.serverName}::${event.payload.toolName}`;
          setToolActivities((current) => {
            const next = current.filter((item) => item.key !== key);
            next.push({
              key,
              label: `Running ${event.payload.toolName} on ${event.payload.serverName}`,
              status: "running",
            });
            return next;
          });
        });

        unlistenToolResult = await listen<AgentToolEvent>("agent-tool-result", (event) => {
          if (event.payload.streamId !== streamId) return;
          const key = `${event.payload.serverName}::${event.payload.toolName}`;
          clearApprovalForTool(streamId, event.payload.serverName, event.payload.toolName);
          setToolActivities((current) => {
            const next = current.filter((item) => item.key !== key);
            next.push({
              key,
              label: `Completed ${event.payload.toolName}`,
              status: "success",
              summary: event.payload.summary ?? undefined,
            });
            return next;
          });
        });

        unlistenToolError = await listen<AgentToolEvent>("agent-tool-error", (event) => {
          if (event.payload.streamId !== streamId) return;
          const key = `${event.payload.serverName}::${event.payload.toolName}`;
          clearApprovalForTool(streamId, event.payload.serverName, event.payload.toolName);
          setToolActivities((current) => {
            const next = current.filter((item) => item.key !== key);
            next.push({
              key,
              label: `Blocked ${event.payload.toolName}`,
              status: "error",
              summary: event.payload.summary ?? undefined,
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
              messages: latestConversation.messages.map((message) => ({
                role: message.role,
                content: message.content,
              })),
            },
          });
        } catch (invokeError) {
          rejectOnce(invokeError instanceof Error ? invokeError : new Error("Failed to start chat stream"));
        }
      });

      await streamCompletion;

      const postStreamConversation = useChatStore
        .getState()
        .conversations.find((conversation) => conversation.id === activeConversation.id);

      if (postStreamConversation && !isIncognito && !useChatStore.getState().cleaningUp) {
        await saveConversation(postStreamConversation);
        const latestAssistant = postStreamConversation.messages[postStreamConversation.messages.length - 1];
        if (latestAssistant && latestAssistant.role === "assistant") {
          await saveMessage({ ...latestAssistant, conversationId: postStreamConversation.id });
        }
      }

      markProviderSuccess(streamProviderKey, fallbackUsed);
    } catch (streamError) {
      const message = streamError instanceof Error ? streamError.message : "Unknown error";
      setError(message);
      markProviderFailure(provider);
    } finally {
      setActiveStreamId(null);
      stopStreaming();
    }
  }

  const providerStatus = providerHealth[provider];
  const serverCount = Object.keys(activeServers).length;

  return (
    <div key={sessionKey} className="h-full">
      <div className={mode === "full" ? "grid h-full grid-cols-[280px_minmax(0,1fr)_320px] gap-4" : "grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"}>
        {mode === "full" ? (
          <section
            className="flex min-h-0 flex-col rounded-3xl border"
            style={{ backgroundColor: "var(--surface-panel)", borderColor: "var(--border-panel)" }}
          >
            <div className="flex items-center justify-between border-b px-4 py-4" style={{ borderColor: "var(--border-panel)" }}>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Conversations
                </h2>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Stored locally{isIncognito ? " • incognito active" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={createConversation}
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: "var(--surface-elevated)", color: "var(--text-primary)" }}
              >
                <MessageSquarePlus size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-2">
                {sortedConversations.map((conversation) => {
                  const active = conversation.id === activeConversationId;
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setActiveConversation(conversation.id)}
                      className="w-full rounded-2xl border px-3 py-3 text-left"
                      style={{
                        backgroundColor: active ? "rgba(93, 227, 201, 0.08)" : "var(--surface-elevated)",
                        borderColor: active ? "var(--border-focus)" : "var(--border-subtle)",
                      }}
                    >
                      <p className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {conversation.title}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        {conversation.messages.length} messages
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        <section
          className="flex min-h-0 flex-col rounded-3xl border p-5"
          style={{ backgroundColor: "var(--surface-panel)", borderColor: "var(--border-panel)" }}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[18px] font-semibold" style={{ color: "var(--text-primary)" }}>
                {mode === "full" ? (activeConversation?.title ?? "Conversation") : "HelpeX Chat"}
              </h2>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                {activeStreamProvider ?? `${provider} • ${model}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleToggleIncognito}
                disabled={!isIncognito && toggleLocked}
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
              >
                {isIncognito ? <EyeOff size={15} /> : <Eye size={15} />}
                {isIncognito ? "Incognito" : "Standard"}
              </button>
              <button
                type="button"
                onClick={() => setIncognitoConfirmOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
              >
                <Trash2 size={15} />
                Wipe
              </button>
              {mode === "compact" && onOpenChatPage ? (
                <button
                  type="button"
                  onClick={onOpenChatPage}
                  className="rounded-xl px-3 py-2 text-sm font-medium"
                  style={{ backgroundColor: "var(--surface-elevated)", color: "var(--text-primary)" }}
                >
                  Open chat
                </button>
              ) : null}
            </div>
          </div>

          {error ? (
            <div
              className="mb-4 flex items-center gap-2 rounded-2xl border px-3 py-3 text-sm"
              style={{ borderColor: "rgba(248, 113, 113, 0.3)", backgroundColor: "rgba(127, 29, 29, 0.12)", color: "var(--status-danger)" }}
            >
              <ShieldAlert size={16} />
              {error}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap gap-2">
            {SUGGESTED_ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => void handleSend(action)}
                disabled={isStreaming}
                className="rounded-full border px-3 py-1.5 text-xs"
                style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
              >
                {action}
              </button>
            ))}
            {onOpenSettings ? (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
                style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
              >
                <Settings size={13} />
                Settings
              </button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1">
            <MessageList messages={visibleMessages} isStreaming={isStreaming} variant={mode} />
          </div>

          <div className="mt-4">
            <MessageInput
              disabled={!activeConversation}
              isStreaming={isStreaming}
              onCancel={cancelActiveStream}
              onSubmit={handleSend}
              variant={mode}
            />
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-4">
          <section
            className="rounded-3xl border p-5"
            style={{ backgroundColor: "var(--surface-panel)", borderColor: "var(--border-panel)" }}
          >
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Runtime
            </h3>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span style={{ color: "var(--text-secondary)" }}>Provider</span>
                <span style={{ color: "var(--text-primary)" }}>{provider}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: "var(--text-secondary)" }}>Model</span>
                <span style={{ color: "var(--text-primary)" }}>{model}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: "var(--text-secondary)" }}>MCP servers</span>
                <span style={{ color: "var(--text-primary)" }}>{serverCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: "var(--text-secondary)" }}>Tokens</span>
                <span style={{ color: "var(--text-primary)" }}>{conversationTokenEstimate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: "var(--text-secondary)" }}>Health</span>
                <span style={{ color: providerStatus?.healthy ? "var(--status-success)" : "var(--text-muted)" }}>
                  {providerStatus?.message ?? "Unchecked"}
                </span>
              </div>
            </div>
          </section>

          <section
            className="flex min-h-0 flex-1 flex-col rounded-3xl border p-5"
            style={{ backgroundColor: "var(--surface-panel)", borderColor: "var(--border-panel)" }}
          >
            <h3 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              MCP Tool Activity
            </h3>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <ToolActivityList
                activities={toolActivities}
                approvals={visibleApprovals}
                approvalBusyId={busyApprovalId}
                onApprovalDecision={handleApprovalDecision}
              />
            </div>
          </section>
        </aside>
      </div>

      {incognitoConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div
            className="w-full max-w-md rounded-3xl border p-5"
            style={{ backgroundColor: "var(--surface-panel-strong)", borderColor: "var(--border-panel)" }}
          >
            <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Clear session data?
            </h3>
            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              {isIncognito
                ? "This clears the current incognito session and returns to standard mode."
                : "This wipes stored chats and local session data from the renderer."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIncognitoConfirmOpen(false)}
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void wipeSession()}
                className="rounded-xl px-3 py-2 text-sm font-medium"
                style={{ backgroundColor: "rgba(248, 113, 113, 0.12)", color: "var(--status-danger)" }}
              >
                Wipe now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
