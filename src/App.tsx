import { useEffect } from "react";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import SettingsPanel from "./components/SettingsPanel";
import { useChatStore } from "./store/chatStore";
import { listConversations, listMessages, mapConversationFromDb, mapMessageFromDb } from "./api/tauriDb";

export default function App(): JSX.Element {
  const setConversations = useChatStore((state) => state.setConversations);

  useEffect(() => {
    let cancelled = false;

    async function loadPersistedData() {
      try {
        const rows = await listConversations();
        if (!rows.length || cancelled) {
          return;
        }

        const conversations = await Promise.all(
          rows.map(async (row) => {
            const mappedConversation = mapConversationFromDb(row);
            const messageRows = await listMessages(mappedConversation.id);
            return {
              ...mappedConversation,
              messages: messageRows.map(mapMessageFromDb)
            };
          })
        );

        if (!cancelled) {
          setConversations(conversations, conversations[0]?.id ?? null);
        }
      } catch {
        return;
      }
    }

    loadPersistedData();

    return () => {
      cancelled = true;
    };
  }, [setConversations]);

  return (
    <div className="app-shell">
      <Sidebar />
      <ChatPanel />
      <SettingsPanel />
    </div>
  );
}
