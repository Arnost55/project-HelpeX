import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import CommandPalette from "../components/CommandPalette";
import AppShell from "../components/layout/AppShell";
import ActivityFeed from "../components/dashboard/ActivityFeed";
import AutomationList from "../components/dashboard/AutomationList";
import CameraGrid from "../components/dashboard/CameraGrid";
import Panel from "../components/dashboard/Panel";
import SecurityOverview from "../components/dashboard/SecurityOverview";
import SystemStatus from "../components/dashboard/SystemStatus";
import { McpControlCenter } from "../components/McpControlCenter";
import {
  placeholderActivityEvents,
  placeholderAutomations,
  placeholderCameras,
  placeholderSecurity,
  placeholderServices,
} from "../data/opsConsole";
import { loadUserProfile } from "../api/userProfile";
import { listConversations, listMessages, mapConversationFromDb, mapMessageFromDb } from "../api/tauriDb";
import Overview from "./Overview";
import ChatPage from "./ChatPage";
import ConsoleSectionPage from "./ConsoleSectionPage";
import Settings from "./Settings";
import { useChatStore } from "../store/chatStore";
import { useSettingsStore } from "../store/settingsStore";
import { useToolApprovalStore } from "../store/toolApprovalStore";
import { useMcp } from "../hooks/useMcp";
import type { AppSection } from "../types/shell";
import type { CoreMetric } from "../types/ops";
import { formatDurationFromMs } from "../utils/formatting";

type SettingsTab = "ai" | "integration" | "appearance" | "system";

interface ApprovalEvent {
  requestId: string;
  streamId?: string | null;
  serverName: string;
  toolName: string;
  arguments: unknown;
  permission: {
    level: string;
    decision: string;
    source: string;
  };
}

interface AgentToolEvent {
  streamId: string;
  serverName: string;
  toolName: string;
}

export default function RootPage(): JSX.Element {
  const setConversations = useChatStore((state) => state.setConversations);
  const createConversation = useChatStore((state) => state.createConversation);
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const { activeServers } = useMcp();
  const upsertPendingApproval = useToolApprovalStore((state) => state.upsertPending);
  const clearApprovalForTool = useToolApprovalStore((state) => state.clearForTool);
  const pendingApprovals = useToolApprovalStore((state) => state.pending);
  const [activeSection, setActiveSection] = useState<AppSection>("overview");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("ai");
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [userName, setUserName] = useState("Operator");
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [uptimeTick, setUptimeTick] = useState(Date.now());
  const sessionStartedAtRef = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;

    async function loadPersistedData() {
      try {
        const rows = await listConversations();
        if (!rows.length || cancelled) return;

        const conversations = await Promise.all(
          rows.map(async (row) => {
            const mappedConversation = mapConversationFromDb(row);
            const messageRows = await listMessages(mappedConversation.id);
            return {
              ...mappedConversation,
              messages: messageRows.map(mapMessageFromDb),
            };
          }),
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
    let mounted = true;

    loadUserProfile()
      .then((profile) => {
        if (!mounted || !profile) return;
        const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
        if (fullName) {
          setUserName(fullName);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const interval = window.setInterval(() => setUptimeTick(Date.now()), 60000);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlistenToggle: (() => void) | undefined;
    let unlistenApproval: (() => void) | undefined;
    let unlistenToolResult: (() => void) | undefined;
    let unlistenToolError: (() => void) | undefined;

    async function bindEvents() {
      unlistenToggle = await listen("toggle-command-palette", () => {
        setIsCommandPaletteOpen((current) => !current);
      });

      unlistenApproval = await listen<ApprovalEvent>("agent-tool-approval-request", (event) => {
        upsertPendingApproval({
          requestId: event.payload.requestId,
          streamId: event.payload.streamId,
          serverName: event.payload.serverName,
          toolName: event.payload.toolName,
          arguments: event.payload.arguments,
          permission: event.payload.permission,
          requestedAt: new Date().toISOString(),
        });
      });

      const clearFromEvent = (event: { payload: AgentToolEvent }) => {
        clearApprovalForTool(
          event.payload.streamId,
          event.payload.serverName,
          event.payload.toolName,
        );
      };

      unlistenToolResult = await listen<AgentToolEvent>("agent-tool-result", clearFromEvent);
      unlistenToolError = await listen<AgentToolEvent>("agent-tool-error", clearFromEvent);
    }

    void bindEvents();

    return () => {
      disposed = true;
      if (disposed) {
        unlistenToggle?.();
        unlistenApproval?.();
        unlistenToolResult?.();
        unlistenToolError?.();
      }
    };
  }, [clearApprovalForTool, upsertPendingApproval]);

  const handleThemeChange = useCallback(
    async (themeObject: { id: string; isCustom?: boolean; colors?: Record<string, string> }) => {
      setTheme(themeObject.id);
      document.documentElement.removeAttribute("style");

      if (themeObject.isCustom && themeObject.colors) {
        Object.entries(themeObject.colors).forEach(([variable, value]) => {
          document.documentElement.style.setProperty(variable, value);
        });
      } else {
        document.documentElement.setAttribute("data-theme", themeObject.id);
      }

      try {
        await invoke("save_config", { activeTheme: themeObject.id });
      } catch (error) {
        console.error("Failed to commit theme:", error);
      }
    },
    [setTheme],
  );

  const coreMetrics = useMemo<CoreMetric[]>(
    () => [
      { id: "cpu", label: "CPU", value: "--", source: { kind: "placeholder", label: "Placeholder" } },
      { id: "ram", label: "RAM", value: "--", source: { kind: "placeholder", label: "Placeholder" } },
      {
        id: "uptime",
        label: "Uptime",
        value: formatDurationFromMs(uptimeTick - sessionStartedAtRef.current),
        source: { kind: "live", label: "Live" },
      },
      {
        id: "connectivity",
        label: "Network",
        value: isOnline ? "Online" : "Offline",
        source: { kind: "live", label: "Live" },
      },
    ],
    [isOnline, uptimeTick],
  );

  const connectedServerCount = Object.keys(activeServers).length;
  const systemStatusLabel = connectedServerCount > 0 || isOnline ? "System Online" : "Attention Required";

  function openSettings(tab: SettingsTab = "ai"): void {
    setSettingsTab(tab);
    setIsSettingsModalOpen(true);
  }

  function renderActiveSection(): JSX.Element {
    switch (activeSection) {
      case "overview":
        return (
          <Overview
            activeServerCount={connectedServerCount}
            cameraCount={placeholderCameras.length}
            onOpenChatPage={() => setActiveSection("chat")}
            onOpenSettings={() => openSettings("ai")}
            operatorName={userName}
          />
        );
      case "chat":
        return <ChatPage onOpenSettings={() => openSettings("ai")} />;
      case "automations":
        return (
          <ConsoleSectionPage
            title="Automations"
            description="Automation state remains placeholder-backed until backend automation bindings are connected."
          >
            <Panel title="Active Automations">
              <AutomationList automations={placeholderAutomations} />
            </Panel>
          </ConsoleSectionPage>
        );
      case "tools":
        return (
          <ConsoleSectionPage
            title="Tools"
            description="Manage MCP servers, restore runtime tools, and inspect connected capabilities."
          >
            <Panel title="MCP Control Center" description="This surface uses the live MCP runtime and persisted server configuration.">
              <McpControlCenter />
            </Panel>
          </ConsoleSectionPage>
        );
      case "security":
        return (
          <ConsoleSectionPage
            title="Security"
            description="Security posture is UI-only here; sensitive enforcement continues in the Rust backend."
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <Panel title="Security Overview">
                <SecurityOverview security={placeholderSecurity} />
              </Panel>
              <Panel title="Recent Security Events">
                <ActivityFeed events={placeholderActivityEvents.filter((event) => event.category === "security")} />
              </Panel>
            </div>
          </ConsoleSectionPage>
        );
      case "cameras":
        return (
          <ConsoleSectionPage
            title="Cameras"
            description="Camera cards are architected for future Frigate preview and detection event bindings."
          >
            <Panel title="Camera Grid">
              <CameraGrid cameras={placeholderCameras} />
            </Panel>
          </ConsoleSectionPage>
        );
      case "servers":
      case "systems":
        return (
          <ConsoleSectionPage
            title={activeSection === "servers" ? "Servers" : "Systems"}
            description="Service rows are placeholder data until live backend service health endpoints are exposed."
          >
            <Panel title="System Status">
              <SystemStatus services={placeholderServices} />
            </Panel>
          </ConsoleSectionPage>
        );
      case "network":
        return (
          <ConsoleSectionPage
            title="Network"
            description="Network status will move to live backend telemetry once host and edge metrics are exposed."
          >
            <Panel title="Connectivity">
              <SystemStatus services={placeholderServices.filter((service) => ["Internet", "MQTT Broker", "Home Assistant"].includes(service.name))} />
            </Panel>
          </ConsoleSectionPage>
        );
      case "logs":
        return (
          <ConsoleSectionPage
            title="Logs"
            description="The current log feed is a placeholder-ready event model designed for future integrations."
          >
            <Panel title="Recent Activity">
              <ActivityFeed events={placeholderActivityEvents} />
            </Panel>
          </ConsoleSectionPage>
        );
      default:
        return <Overview activeServerCount={connectedServerCount} cameraCount={placeholderCameras.length} onOpenChatPage={() => setActiveSection("chat")} onOpenSettings={() => openSettings("ai")} operatorName={userName} />;
    }
  }

  return (
    <>
      <AppShell
        activeSection={activeSection}
        coreMetrics={coreMetrics}
        notificationCount={pendingApprovals.length}
        systemStatusLabel={systemStatusLabel}
        userName={userName}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenSettings={() => openSettings("ai")}
        onSelectSection={setActiveSection}
      >
        {renderActiveSection()}
      </AppShell>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNewChat={() => {
          createConversation();
          setActiveSection("chat");
        }}
        onOpenSettings={() => openSettings("ai")}
        onSelectSection={(section) => setActiveSection(section)}
      />

      {isSettingsModalOpen ? (
        <Settings
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          activeTab={settingsTab}
          onTabChange={(tab: string) => setSettingsTab(tab as SettingsTab)}
          onThemeChange={handleThemeChange}
        />
      ) : null}
    </>
  );
}
