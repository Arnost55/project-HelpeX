import { useMemo } from "react";
import { Settings } from "lucide-react";
import { useChatStore } from "../store/chatStore";

export default function Sidebar(props: {
  activeTab: "chat" | "settings";
  onSelectTab: (tab: "chat" | "settings") => void;
  isSettingsModalOpen: boolean;
  onToggleSettings: () => void;
}): JSX.Element {
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
        <div className="flex items-center gap-2">
          <h1>JARVIS</h1>
          <button
            type="button"
            onClick={props.onToggleSettings}
            className="p-1 rounded transition-colors hover:opacity-80"
            style={{ color: 'var(--accent-glow)' }}
            title="Settings"
          >
            <Settings
              size={18}
              className="transition-all duration-200"
              style={{ cursor: 'pointer' }}
            />
          </button>
        </div>
        <button type="button" onClick={createConversation}>
          + New Chat
        </button>
      </div>

      <div className="sidebar-tabs">
        <button
          type="button"
          className={props.activeTab === "chat" ? "tab-button active" : "tab-button"}
          onClick={() => props.onSelectTab("chat")}
        >
          Chat
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
                onClick={() => {
                  props.onSelectTab("chat");
                  setActiveConversation(conversation.id);
                }}
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
