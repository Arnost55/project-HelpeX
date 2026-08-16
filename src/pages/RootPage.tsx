import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import CommandPalette from "../components/CommandPalette";
import AppShell from "../components/layout/AppShell";
import Panel from "../components/dashboard/Panel";
import { McpControlCenter } from "../components/McpControlCenter";
import { listProviderSecretStatuses } from "../api/providers";
import { loadUserProfile } from "../api/userProfile";
import { listConversations, listMessages, mapConversationFromDb, mapMessageFromDb } from "../api/tauriDb";
import { loadAppConfig, saveAppConfig } from "../api/settingsApi";
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
  approvalId: string;
  streamId?: string | null;
  providerToolName?: string | null;
  serverName: string;
  toolName: string;
  arguments: unknown;
  permission: {
    level: string;
    decision: string;
    source: string;
  };
  riskLevel: string;
  actionLabel: string;
  description?: string | null;
  requestOrigin: string;
  capability: {
    action: string;
    target: string;
  };
  scope: {
    kind: string;
    identifier: string;
  };
  requestedAtMs: number;
  expiresAtMs: number;
}

interface ApprovalResolvedEvent {
  approvalId: string;
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
  const hydrateFromConfig = useSettingsStore((state) => state.hydrateFromConfig);
  const hydrated = useSettingsStore((state) => state.hydrated);
  const setProviderSecretStatuses = useSettingsStore((state) => state.setProviderSecretStatuses);
  const { activeServers, servers } = useMcp();
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
  const saveTimerRef = useRef<number | null>(null);

  const configSnapshot = useSettingsStore((state) => state.snapshotConfig());

  useEffect(() => {
    let cancelled = false;

    loadAppConfig()
      .then((config) => {
        if (!cancelled) {
          hydrateFromConfig(config);
        }
      })
      .catch(() => undefined);

    void listProviderSecretStatuses()
      .then((statuses) => {
        if (!cancelled) {
          setProviderSecretStatuses(statuses);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [hydrateFromConfig, setProviderSecretStatuses]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void saveAppConfig(configSnapshot).catch(() => undefined);
    }, 350);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [configSnapshot, hydrated]);

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
    let unlistenApprovalResolved: (() => void) | undefined;
    let unlistenToolResult: (() => void) | undefined;
    let unlistenToolError: (() => void) | undefined;

    async function bindEvents() {
      unlistenToggle = await listen("toggle-command-palette", () => {
        setIsCommandPaletteOpen((current) => !current);
      });

      unlistenApproval = await listen<ApprovalEvent>("agent-tool-approval-request", (event) => {
        upsertPendingApproval({
          approvalId: event.payload.approvalId,
          streamId: event.payload.streamId,
          providerToolName: event.payload.providerToolName,
          serverName: event.payload.serverName,
          toolName: event.payload.toolName,
          arguments: event.payload.arguments,
          permission: event.payload.permission,
          riskLevel: event.payload.riskLevel,
          actionLabel: event.payload.actionLabel,
          description: event.payload.description,
          requestOrigin: event.payload.requestOrigin,
          capability: event.payload.capability,
          scope: event.payload.scope,
          requestedAtMs: event.payload.requestedAtMs,
          expiresAtMs: event.payload.expiresAtMs,
        });
      });

      unlistenApprovalResolved = await listen<ApprovalResolvedEvent>("agent-tool-approval-resolved", (event) => {
        useToolApprovalStore.getState().removePending(event.payload.approvalId);
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
        unlistenApprovalResolved?.();
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
  const availableToolCount = servers.reduce((sum, server) => sum + server.toolCount, 0);
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
            connectedServerCount={connectedServerCount}
            availableToolCount={availableToolCount}
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
            description="Automation runtime is out of scope for this sprint, so HelpeX shows an honest empty state instead of fake automation data."
          >
            <Panel title="Automations">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No live automation engine is connected yet.
              </p>
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
            description="Approval and authorization are enforced in the backend. Security telemetry and posture dashboards are not implemented yet."
          >
            <Panel title="Security State">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No live security telemetry source is connected. Tool authorization, approvals, and audit logging still remain active in the Rust backend.
              </p>
            </Panel>
          </ConsoleSectionPage>
        );
      case "cameras":
        return (
          <ConsoleSectionPage
            title="Cameras"
            description="Camera integrations are intentionally out of scope for this sprint."
          >
            <Panel title="Cameras">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No camera providers are configured. Frigate and camera event pipelines are planned for a later sprint.
              </p>
            </Panel>
          </ConsoleSectionPage>
        );
      case "servers":
      case "systems":
        return (
          <ConsoleSectionPage
            title={activeSection === "servers" ? "Servers" : "Systems"}
            description="Host and service telemetry are not wired yet, so HelpeX shows real runtime state only where data exists."
          >
            <Panel title="Systems">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                System health telemetry has not been implemented yet.
              </p>
            </Panel>
          </ConsoleSectionPage>
        );
      case "network":
        return (
          <ConsoleSectionPage
            title="Network"
            description="The shell can tell whether the desktop is online, but detailed network telemetry is not implemented yet."
          >
            <Panel title="Connectivity">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Network telemetry beyond basic online or offline status is not available yet.
              </p>
            </Panel>
          </ConsoleSectionPage>
        );
      case "logs":
        return (
          <ConsoleSectionPage
            title="Logs"
            description="HelpeX currently exposes audit trails for tools and approvals in the backend, but a frontend log explorer is not implemented yet."
          >
            <Panel title="Recent Activity">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No frontend log viewer is available yet. Use the current MCP and tool activity surfaces for live runtime status.
              </p>
            </Panel>
          </ConsoleSectionPage>
        );
      default:
        return <Overview connectedServerCount={connectedServerCount} availableToolCount={availableToolCount} onOpenChatPage={() => setActiveSection("chat")} onOpenSettings={() => openSettings("ai")} operatorName={userName} />;
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
