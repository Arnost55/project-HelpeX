import { useEffect, useMemo, useState } from "react";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import { useChatStore } from "../store/chatStore";
import { useSettingsStore } from "../store/settingsStore";
import { createId } from "../utils/id";
import { streamOpenAiResponse } from "../api/openai";
import { saveConversation, saveMessage } from "../api/tauriDb";

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

  const activeConversation = useMemo(() => {
    if (activeConversationId) {
      return conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
    }

    return conversations[0] ?? null;
  }, [activeConversationId, conversations]);

  useEffect(() => {
    if (activeConversation && !activeConversationId) {
      setActiveConversation(activeConversation.id);
    }
  }, [activeConversation, activeConversationId, setActiveConversation]);

  async function handleSend(text: string): Promise<void> {
    if (!activeConversation) {
      return;
    }

    if (!apiKey) {
      setError("Set your OpenAI API key in Settings before sending messages.");
      return;
    }

    setError(null);

    addMessage(activeConversation.id, {
      id: createId("msg"),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
      conversationId: activeConversation.id
    });

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

    try {
      startStreaming();
      const latestConversation =
        useChatStore
          .getState()
          .conversations.find((conversation) => conversation.id === activeConversation.id) ?? activeConversation;

      await streamOpenAiResponse({
        apiKey,
        model,
        messages: latestConversation.messages,
        onToken: (token) => {
          appendAssistantToken(activeConversation.id, token);
        }
      });

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
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      stopStreaming();
    }
  }

  return (
    <section className="chat-panel">
      <header className="chat-topbar">
        <div>
          <h2>{activeConversation?.title ?? "No conversation"}</h2>
          <p>Model: {model}</p>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <MessageList messages={activeConversation?.messages ?? []} />
      <MessageInput disabled={isStreaming} onSubmit={handleSend} />
    </section>
  );
}
