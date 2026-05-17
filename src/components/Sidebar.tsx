import { useMemo } from "react";
import { Settings, Bot } from "lucide-react";
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
    <div className="flex flex-col p-4 gap-2 h-full justify-between">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Bot size={14} style={{ color: 'var(--accent-cyan)' }} />
            <span className="sidebar-label">JARVIS</span>
          </div>
          <button
            onClick={props.onToggleSettings}
            className="sidebar-icon-btn settings-icon"
            title="Settings"
          >
            <Settings size={16} />
          </button>
        </div>

        <button
          className={`sidebar-ghost-btn${props.activeTab === "chat" ? " active" : ""}`}
          onClick={() => props.onSelectTab("chat")}
        >
          Chat
        </button>

        <button
          className="sidebar-ghost-btn"
          onClick={createConversation}
        >
          + New Chat
        </button>

        <ul className="flex flex-col gap-0.5 mt-1">
          {sortedConversations.map((conversation) => {
            const active = conversation.id === activeConversationId;
            return (
              <li key={conversation.id}>
                <button
                  className={`sidebar-conversation-item${active ? " active" : ""}`}
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
      </div>

      <span className="sidebar-label">JARVIS v0.1.0</span>
    </div>
  );
}
