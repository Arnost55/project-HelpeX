import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import { useChatStore } from "../store/chatStore";
import { useSettingsStore } from "../store/settingsStore";
import { createId } from "../utils/id";
import { saveConversation, saveMessage } from "../api/tauriDb";
import { estimateConversationTokens } from "../utils/tokens";

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

export default function ChatPanel(): JSX.Element {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const addMessage = useChatStore((state) => state.addMessage);
  const appendAssistantToken = useChatStore((state) => state.appendAssistantToken);
  const startStreaming = useChatStore((state) => state.startStreaming);
  const stopStreaming = useChatStore((state) => state.stopStreaming);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const provider = useSettingsStore((state) => state.provider);
  const apiKey = useSettingsStore((state) => state.openAiApiKey);
  const claudeApiKey = useSettingsStore((state) => state.claudeApiKey);
  const ollamaBaseUrl = useSettingsStore((state) => state.ollamaBaseUrl);
  const model = useSettingsStore((state) => state.model);
  const fallbackProvider = useSettingsStore((state) => state.fallbackProvider);
  const fallbackModel = useSettingsStore((state) => state.fallbackModel);
  const temperature = useSettingsStore((state) => state.temperature);
  const maxTokens = useSettingsStore((state) => state.maxTokens);
  const [error, setError] = useState<string | null>(null);
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [activeStreamProvider, setActiveStreamProvider] = useState<string | null>(null);
  const [activeFallbackUsed, setActiveFallbackUsed] = useState(false);

  const activeConversation = useMemo(() => {
    if (activeConversationId) {
      return conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
    }

    return conversations[0] ?? null;
  }, [activeConversationId, conversations]);

  const conversationTokenEstimate = useMemo(() => {
    if (!activeConversation) {
      return 0;
    }

    return estimateConversationTokens(activeConversation.messages);
  }, [activeConversation]);

  useEffect(() => {
    if (activeConversation && !activeConversationId) {
      setActiveConversation(activeConversation.id);
    }
  }, [activeConversation, activeConversationId, setActiveConversation]);

  useEffect(() => {
    return () => {
      if (activeStreamId) {
        void invoke("cancel_chat_stream", { streamId: activeStreamId, stream_id: activeStreamId });
      }
    };
  }, [activeStreamId]);

  async function handleSend(text: string): Promise<void> {
    if (!activeConversation) {
      return;
    }

    if (provider === "openai") {
      const trimmedApiKey = apiKey.trim();
      if (!trimmedApiKey) {
        setError("Set your OpenAI API key in Settings before sending messages.");
        throw new Error("Missing OpenAI API key");
      }
    }

    if (provider === "claude") {
      const trimmedApiKey = claudeApiKey.trim();
      if (!trimmedApiKey) {
        setError("Set your Claude API key in Settings before sending messages.");
        throw new Error("Missing Claude API key");
      }
    }

    if (provider === "ollama") {
      const trimmedBaseUrl = ollamaBaseUrl.trim();
      if (!trimmedBaseUrl) {
        setError("Set your Ollama URL in Settings before sending messages.");
        throw new Error("Missing Ollama base URL");
      }
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

      const refreshedConvo = useChatStore
        .getState()
        .conversations.find((conversation) => conversation.id === activeConversation.id);

      if (refreshedConvo) {
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
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          resolve();
        };

        const rejectOnce = (error: Error) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          reject(error);
        };

        unlistenChunk = await listen<StreamChunkEvent>("chat-stream-chunk", (event) => {
          if (event.payload.streamId !== streamId) {
            return;
          }

          appendAssistantToken(activeConversation.id, event.payload.token);
        });

        unlistenDone = await listen<StreamDoneEvent>("chat-stream-done", (event) => {
          if (event.payload.streamId !== streamId) {
            return;
          }

          resolveOnce();
        });

        unlistenError = await listen<StreamErrorEvent>("chat-stream-error", (event) => {
          if (event.payload.streamId !== streamId) {
            return;
          }

          rejectOnce(new Error(event.payload.message));
        });

        unlistenProvider = await listen<StreamProviderEvent>("chat-stream-provider", (event) => {
          if (event.payload.streamId !== streamId) {
            return;
          }

          const providerLabel = event.payload.fallbackUsed
            ? `${event.payload.provider} (fallback)`
            : event.payload.provider;
          setActiveFallbackUsed(event.payload.fallbackUsed);
          setActiveStreamProvider(`${providerLabel} • ${event.payload.model}`);
        });

        try {
          await invoke("stream_chat", {
            request: {
              streamId,
              provider,
              model,
              apiKey: provider === "openai" ? apiKey.trim() : provider === "claude" ? claudeApiKey.trim() : undefined,
              baseUrl: provider === "ollama" ? ollamaBaseUrl.trim() : undefined,
              temperature,
              maxTokens,
              fallbackProvider,
              fallbackModel,
              fallbackApiKey:
                fallbackProvider === "openai"
                  ? apiKey.trim()
                  : fallbackProvider === "claude"
                    ? claudeApiKey.trim()
                    : undefined,
              fallbackBaseUrl: fallbackProvider === "ollama" ? ollamaBaseUrl.trim() : undefined,
              messages: latestConversation.messages.map((message) => ({
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

      if (postStreamConvo) {
        await saveConversation(postStreamConvo);
        const latestAssistant = postStreamConvo.messages[postStreamConvo.messages.length - 1];
        if (latestAssistant && latestAssistant.role === "assistant") {
          await saveMessage({ ...latestAssistant, conversationId: postStreamConvo.id });
        }
      }
    } catch (err) {
      const message = err instanceof Error
          ? err.message
          : "Unknown error";
      setError(message);

      const postErrorConvo = useChatStore
        .getState()
        .conversations.find((conversation) => conversation.id === activeConversation.id);

      if (postErrorConvo) {
        await saveConversation(postErrorConvo);
        const latestAssistant = postErrorConvo.messages[postErrorConvo.messages.length - 1];
        if (latestAssistant && latestAssistant.role === "assistant") {
          await saveMessage({ ...latestAssistant, conversationId: postErrorConvo.id });
        }
      }

    } finally {
      setActiveStreamId(null);
      setActiveStreamProvider(null);
      setActiveFallbackUsed(false);
      stopStreaming();
    }
  }

  function handleStop(): void {
    if (!activeStreamId) {
      return;
    }

    setError("Generation stopped.");
    void invoke("cancel_chat_stream", { streamId: activeStreamId, stream_id: activeStreamId });
  }

  return (
    <section className="chat-panel">
      <header className="chat-topbar">
        <div>
          <h2>{activeConversation?.title ?? "No conversation"}</h2>
          <p>
            Provider: {provider} | Model: {model} | Messages: {activeConversation?.messages.length ?? 0} | Est. tokens: {conversationTokenEstimate}
          </p>
          {activeStreamProvider ? <p>Streaming via {activeStreamProvider}</p> : null}
          {activeFallbackUsed ? <p>Primary provider failed, switched to fallback.</p> : null}
        </div>
        {isStreaming ? (
          <button type="button" className="stop-button" onClick={handleStop}>
            Stop
          </button>
        ) : null}
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <MessageList messages={activeConversation?.messages ?? []} isStreaming={isStreaming} />
      <MessageInput disabled={isStreaming} onSubmit={handleSend} />
    </section>
  );
}
