import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Conversation, Message } from "../types/chat";
import { createId } from "../utils/id";

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isStreaming: boolean;
  draft: string;
  createConversation: () => void;
  setActiveConversation: (id: string) => void;
  setDraft: (value: string) => void;
  addMessage: (conversationId: string, message: Message) => void;
  setConversations: (conversations: Conversation[], activeConversationId: string | null) => void;
  appendAssistantToken: (conversationId: string, token: string) => void;
  startStreaming: () => void;
  stopStreaming: () => void;
}

function now(): string {
  return new Date().toISOString();
}

function createNewConversation(): Conversation {
  const timestamp = now();
  return {
    id: createId("conv"),
    title: "New conversation",
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: []
  };
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [createNewConversation()],
      activeConversationId: null,
      isStreaming: false,
      draft: "",
      createConversation: () => {
        const conversation = createNewConversation();
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          activeConversationId: conversation.id
        }));
      },
      setActiveConversation: (id) => set({ activeConversationId: id }),
      setDraft: (value) => set({ draft: value }),
      setConversations: (conversations, activeConversationId) =>
        set({ conversations, activeConversationId }),
      addMessage: (conversationId, message) => {
        set((state) => ({
          conversations: state.conversations.map((conv) => {
            if (conv.id !== conversationId) {
              return conv;
            }

            const nextMessages = [...conv.messages, message];
            const title =
              conv.title === "New conversation" && message.role === "user"
                ? message.content.slice(0, 40) || "New conversation"
                : conv.title;

            return {
              ...conv,
              title,
              messages: nextMessages,
              updatedAt: now()
            };
          })
        }));
      },
      appendAssistantToken: (conversationId, token) => {
        const { conversations } = get();
        const conversation = conversations.find((conv) => conv.id === conversationId);

        if (!conversation) {
          return;
        }

        const lastMessage = conversation.messages[conversation.messages.length - 1];
        const shouldCreateAssistantMessage = !lastMessage || lastMessage.role !== "assistant";

        if (shouldCreateAssistantMessage) {
          set((state) => ({
            conversations: state.conversations.map((conv) => {
              if (conv.id !== conversationId) {
                return conv;
              }

              return {
                ...conv,
                messages: [
                  ...conv.messages,
                  {
                    id: createId("msg"),
                    role: "assistant",
                    content: token,
                    createdAt: now()
                  }
                ],
                updatedAt: now()
              };
            })
          }));
          return;
        }

        set((state) => ({
          conversations: state.conversations.map((conv) => {
            if (conv.id !== conversationId) {
              return conv;
            }

            const nextMessages = [...conv.messages];
            const assistantMessage = nextMessages[nextMessages.length - 1];
            nextMessages[nextMessages.length - 1] = {
              ...assistantMessage,
              content: assistantMessage.content + token
            };

            return {
              ...conv,
              messages: nextMessages,
              updatedAt: now()
            };
          })
        }));
      },
      startStreaming: () => set({ isStreaming: true }),
      stopStreaming: () => set({ isStreaming: false })
    }),
    {
      name: "jarvis-chat-v1",
      partialize: (state) => ({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
        draft: state.draft
      })
    }
  )
);
