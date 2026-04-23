import { invoke } from "@tauri-apps/api/core";
import type { Conversation, Message } from "../types/chat";

export async function saveConversation(conversation: Conversation): Promise<void> {
  await invoke("save_conversation", {
    conversation: {
      id: conversation.id,
      title: conversation.title,
      created_at: conversation.createdAt,
      updated_at: conversation.updatedAt
    }
  });
}

export async function saveMessage(message: Message & { conversation_id?: string }): Promise<void> {
  await invoke("save_message", {
    message: {
      id: message.id,
      created_at: message.createdAt,
      role: message.role,
      content: message.content,
      conversation_id: message.conversation_id ?? message.conversationId
    }
  });
}

export async function listConversations(): Promise<
  Array<{ id: string; title: string; created_at: string; updated_at: string }>
> {
  return invoke("list_conversations");
}

export async function listMessages(
  conversationId: string
): Promise<Array<{ id: string; conversation_id: string; role: "user" | "assistant"; content: string; created_at: string }>> {
  return invoke("list_messages", { conversationId, conversation_id: conversationId });
}

export function mapConversationFromDb(input: {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}): Conversation {
  return {
    id: input.id,
    title: input.title,
    createdAt: input.created_at,
    updatedAt: input.updated_at,
    messages: []
  };
}

export function mapMessageFromDb(input: {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}): Message {
  return {
    id: input.id,
    conversationId: input.conversation_id,
    role: input.role,
    content: input.content,
    createdAt: input.created_at
  };
}
