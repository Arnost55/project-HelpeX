import { useMemo } from "react";
import { useChatStore } from "../store/chatStore";

export default function Sidebar(): JSX.Element {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const createConversation = useChatStore((state) => state.createConversation);

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0
    );
  }, [conversations]);

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <h1>JARVIS</h1>
        <button type="button" onClick={createConversation}>
          + New Chat
        </button>
      </div>

      <ul className="conversation-list">
        {sortedConversations.map((conversation) => {
          const active = conversation.id === activeConversationId;

          return (
            <li key={conversation.id}>
              <button
                type="button"
                className={active ? "conversation-item active" : "conversation-item"}
                onClick={() => setActiveConversation(conversation.id)}
              >
                <span>{conversation.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
