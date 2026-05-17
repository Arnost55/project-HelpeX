import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import QuickActionGrid from "./QuickActionGrid";
import { useChatStore } from "../store/chatStore";
import { useSettingsStore } from "../store/settingsStore";
import { useIncognitoStore } from "../store/incognitoStore";
import { createId } from "../utils/id";
import { saveConversation, saveMessage } from "../api/tauriDb";
import { runJarvisTask } from "../api/settingsApi";
import { estimateConversationTokens } from "../utils/tokens";
import { validateProviderSettings } from "../utils/providerValidation";
import { ACTION_TEMPLATES } from "../utils/promptTemplates";
import type { ActionType } from "../utils/promptTemplates";
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
  const [loadingAction, setLoadingAction] = useState<ActionType | null>(null);

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

  async function handleQuickAction(actionType: ActionType, text: string): Promise<void> {
    setLoadingAction(actionType);
    try {
      const template = ACTION_TEMPLATES[actionType];
      if (!activeConversation) return;
      if (!useChatStore.getState().activeConversationId) return;

      const resolvedApiKey =
        provider === "openai" ? apiKey.trim()
        : provider === "claude" ? claudeApiKey.trim()
        : provider === "groq" ? groqApiKey.trim()
        : provider === "together" ? togetherApiKey.trim()
        : undefined;

      const resolvedBaseUrl =
        provider === "ollama" ? ollamaBaseUrl.trim()
        : provider === "groq" ? groqBaseUrl.trim()
        : provider === "together" ? togetherBaseUrl.trim()
        : undefined;

      addMessage(activeConversation.id, {
        id: createId("msg"),
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
        conversationId: activeConversation.id,
      });

      const response = await runJarvisTask({
        taskType: actionType,
        text,
        provider,
        model,
        apiKey: resolvedApiKey,
        baseUrl: resolvedBaseUrl,
        temperature,
        maxTokens,
      });

      addMessage(activeConversation.id, {
        id: createId("msg"),
        role: "assistant",
        content: response,
        createdAt: new Date().toISOString(),
        conversationId: activeConversation.id,
      });

      markProviderSuccess(provider, false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Quick action failed";
      setError(message);
      markProviderFailure(provider);
    } finally {
      setLoadingAction(null);
    }
  }

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

        const cleanup = () => {
          unlistenChunk();
          unlistenDone();
          unlistenError();
          unlistenProvider();
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
      <header className={`flex items-center justify-between px-5 py-3 border-b bg-[#0D1117]/50 ${isIncognito ? 'border-[#A78BFA]/30 incognito-glow-header' : 'border-[#30363D]'}`}>
        <div className="flex items-center gap-4 min-w-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#F0F6FC] truncate">
              {activeConversation?.title ?? "No conversation"}
            </h2>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="flex items-center gap-1 text-[10px] text-[#8B949E]">
                <Cpu size={10} />
                {provider}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-[#8B949E]">
                <Layers size={10} />
                {model}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-[#8B949E]">
                <Hash size={10} />
                {conversationTokenEstimate} tok
              </span>
              {activeStreamProvider && (
                <span className="flex items-center gap-1 text-[10px] text-cyan-400">
                  <Wifi size={10} className="animate-pulse" />
                  {activeStreamProvider}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isIncognito && (
            <span className="incognito-badge flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-semibold animate-pulse">
              <EyeOff size={10} />
              Private Session
            </span>
          )}
          {activeFallbackUsed && (
            <span className="flex items-center gap-1 text-[10px] text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded">
              <AlertTriangle size={10} />
              Fallback active
            </span>
          )}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] ${healthOk ? 'text-green-500 bg-green-500/10' : 'text-[#8B949E] bg-[#21262D]'}`}>
            {healthOk ? <Wifi size={10} /> : <WifiOff size={10} />}
            {healthOk ? 'Connected' : 'No signal'}
          </div>
          <button
            onClick={handleToggleIncognito}
            disabled={!isIncognito && toggleLocked}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all duration-200 ${
              !isIncognito && toggleLocked
                ? 'text-[#484F58] bg-[#161B22] border border-[#21262D] cursor-not-allowed'
                : isIncognito
                  ? 'incognito-badge'
                  : 'text-[#8B949E] bg-[#21262D] border border-[#30363D] hover:text-[#A78BFA] hover:border-[#A78BFA]/30'
            }`}
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
            <span className="flex items-center gap-1 text-[10px] text-[#8B949E] max-w-[140px] leading-tight">
              <MessageSquarePlus size={10} className="flex-shrink-0 text-cyan-500" />
              New Chat to enable
            </span>
          )}
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors"
            >
              <Square size={12} />
              Stop
            </button>
          ) : null}
        </div>
      </header>

      {/* Error */}
      {error ? (
        <div className="mx-5 mt-3 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-xs text-red-400">{error}</span>
        </div>
      ) : null}

      {/* Messages or Quick Actions */}
      {activeConversation && activeConversation.messages.length > 0 ? (
        <>
          <MessageList messages={activeConversation.messages} isStreaming={isStreaming} />
          <MessageInput disabled={isStreaming} onSubmit={handleSend} />
        </>
      ) : (
        <>
          <QuickActionGrid onSendPrompt={handleQuickAction} loadingAction={loadingAction} />
          <MessageInput disabled={isStreaming} onSubmit={(t) => handleSend(t)} />
        </>
      )}

      {/* Incognito Confirmation Dialog */}
      {incognitoConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="cyber-card p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/20 flex items-center justify-center">
                <EyeOff size={18} className="text-[#A78BFA]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#F0F6FC]">End Private Session?</h3>
                <p className="text-[10px] text-[#8B949E] mt-0.5">This will wipe the current session</p>
              </div>
            </div>
            <p className="text-xs text-[#8B949E] mb-5 leading-relaxed">
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
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-[#A78BFA] to-[#8B5CF6] hover:shadow-[0_0_20px_rgba(167,139,250,0.3)] transition-all duration-200"
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
