import { useEffect, useState, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import SettingsPanel from "./components/SettingsPanel";
import { SettingsModal } from "./components/SettingsModal";
import UserProfilePanel from "./components/UserProfilePanel";
import { useChatStore } from "./store/chatStore";
import { useSettingsStore } from "./store/settingsStore";
import { listConversations, listMessages, mapConversationFromDb, mapMessageFromDb } from "./api/tauriDb";
import { invoke } from "@tauri-apps/api/core";

export default function App(): JSX.Element {
  const setConversations = useChatStore((state) => state.setConversations);
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const [activeTab, setActiveTab] = useState<"chat" | "settings" | "user-profile">("chat");
  const [settingsTab, setSettingsTab] = useState<"ai" | "integration" | "appearance" | "system">("ai");
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleThemeChange = useCallback(async (themeObject: { id: string; name?: string; isCustom?: boolean; colors?: Record<string, string> }) => {
    setTheme(themeObject.id);

    document.documentElement.removeAttribute('style');

    if (themeObject.isCustom && themeObject.colors) {
      Object.entries(themeObject.colors).forEach(([cssVariable, hexColor]) => {
        document.documentElement.style.setProperty(cssVariable, hexColor);
      });
    } else {
      document.documentElement.setAttribute('data-theme', themeObject.id);
    }

    try {
      await invoke("save_config", { activeTheme: themeObject.id });
    } catch (err) {
      console.error("Failed to commit theme to config.dat:", err);
    }
  }, [setTheme]);

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)' }}>
      <aside className="w-64 h-full flex flex-col border-r shrink-0" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-panel)' }}>
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isSettingsModalOpen={isSettingsModalOpen}
          onToggleSettings={() => setIsSettingsModalOpen((prev) => !prev)}
          onToggleUserProfile={() => setActiveTab("user-profile")}
        />
      </aside>

      <main className="flex-1 h-full flex flex-col min-w-0" style={{ backgroundColor: 'var(--bg-main)' }}>
        {activeTab === "user-profile" ? (
          <UserProfilePanel onBack={() => setActiveTab("chat")} />
        ) : (
          <ChatPanel onNavigate={(tab) => setActiveTab(tab)} />
        )}
      </main>

      {isSettingsModalOpen && (
        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          activeTab={settingsTab}
          onTabChange={(tab: string) => setSettingsTab(tab as "ai" | "integration" | "appearance" | "system")}
        >
          <SettingsPanel activeTab={settingsTab} onTabChange={setSettingsTab} onThemeChange={handleThemeChange} />
        </SettingsModal>
      )}
    </div>
  );
}
