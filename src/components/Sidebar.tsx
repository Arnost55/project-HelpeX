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
        <div className="flex items-center gap-2 mb-1">
          <Bot size={14} style={{ color: 'var(--accent-glow)' }} />
          <span className="sidebar-label">JARVIS</span>
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

      <div
        className="flex items-center gap-3 px-3 py-2.5 rounded-full"
        style={{ backgroundColor: '#D9D9D9' }}
      >
        <div
          className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden"
          style={{ backgroundColor: '#D9D9D9' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="8" r="3.5" stroke="#1E1E1E" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M4 20c0-3.5 3.5-6 8-6s8 2.5 8 6" stroke="#1E1E1E" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <span className="flex-1 text-sm font-normal truncate" style={{ color: '#1E1E1E', fontFamily: 'Inter, -apple-system, Roboto, Helvetica, sans-serif' }}>
          John Doe
        </span>
        <button
          onClick={props.onToggleSettings}
          className="flex-shrink-0 inline-flex items-center justify-center"
          title="Settings"
          style={{ width: '24px', height: '24px', color: '#1E1E1E', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
}
