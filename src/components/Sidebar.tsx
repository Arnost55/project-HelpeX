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
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-2">
          <h1 className="m-0 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--text-primary)' }}>
            JARVIS
          </h1>
          <button
            type="button"
            onClick={props.onToggleSettings}
            className="p-1 rounded transition-colors hover:opacity-80"
            style={{ color: 'var(--accent-glow)' }}
            title="Settings"
          >
            <Settings size={16} />
          </button>
        </div>
        <button
          type="button"
          onClick={createConversation}
          className="border-0 rounded px-2.5 py-1.5 text-xs font-semibold cursor-pointer transition-colors"
          style={{ backgroundColor: 'var(--accent-glow)', color: '#fff' }}
        >
          + New Chat
        </button>
      </div>

      <div className="flex gap-2 px-4 pt-3 pb-1 shrink-0">
        <button
          type="button"
          className={props.activeTab === "chat" ? "tab-button active" : "tab-button"}
          onClick={() => props.onSelectTab("chat")}
        >
          Chat
        </button>
      </div>

      <ul className="flex-1 overflow-y-auto list-none m-0 p-2 flex flex-col gap-1.5">
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
    </>
  );
}
