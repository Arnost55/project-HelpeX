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

export default function ChatPanel(): JSX.Element {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const addMessage = useChatStore((state) => state.addMessage);
  const appendAssistantToken = useChatStore((state) => state.appendAssistantToken);
  const startStreaming = useChatStore((state) => state.startStreaming);
  const stopStreaming = useChatStore((state) => state.stopStreaming);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const apiKey = useSettingsStore((state) => state.openAiApiKey);
  const model = useSettingsStore((state) => state.model);
  const [error, setError] = useState<string | null>(null);
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);

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
        void invoke("cancel_openai_stream", { streamId: activeStreamId, stream_id: activeStreamId });
      }
    };
  }, [activeStreamId]);

  async function handleSend(text: string): Promise<void> {
    if (!activeConversation) {
      return;
    }

    if (!apiKey) {
      setError("Set your OpenAI API key in Settings before sending messages.");
      throw new Error("Missing API key");
    }

    const trimmedApiKey = apiKey.trim();
    if (!trimmedApiKey.startsWith("sk-")) {
      setError("OpenAI API key format looks invalid. It should start with 'sk-'.");
      throw new Error("Invalid API key format");
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
        const unlistenChunk = await listen<StreamChunkEvent>("chat-stream-chunk", (event) => {
          if (event.payload.streamId !== streamId) {
            return;
          }

          appendAssistantToken(activeConversation.id, event.payload.token);
        });

        const unlistenDone = await listen<StreamDoneEvent>("chat-stream-done", (event) => {
          if (event.payload.streamId !== streamId) {
            return;
          }

          unlistenChunk();
          unlistenDone();
          unlistenError();
          resolve();
        });

        const unlistenError = await listen<StreamErrorEvent>("chat-stream-error", (event) => {
          if (event.payload.streamId !== streamId) {
            return;
          }

          unlistenChunk();
          unlistenDone();
          unlistenError();
          reject(new Error(event.payload.message));
        });

        try {
          await invoke("stream_openai_chat", {
            request: {
              streamId,
              apiKey: trimmedApiKey,
              model,
              messages: latestConversation.messages.map((message) => ({
                role: message.role,
                content: message.content
              }))
            }
          });
        } catch (invokeError) {
          unlistenChunk();
          unlistenDone();
          unlistenError();
          reject(invokeError instanceof Error ? invokeError : new Error("Failed to start stream"));
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
      stopStreaming();
    }
  }

  function handleStop(): void {
    if (!activeStreamId) {
      return;
    }

    setError("Generation stopped.");
    void invoke("cancel_openai_stream", { streamId: activeStreamId, stream_id: activeStreamId });
  }

  return (
    <section className="chat-panel">
      <header className="chat-topbar">
        <div>
          <h2>{activeConversation?.title ?? "No conversation"}</h2>
          <p>
            Model: {model} | Messages: {activeConversation?.messages.length ?? 0} | Est. tokens: {conversationTokenEstimate}
          </p>
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
