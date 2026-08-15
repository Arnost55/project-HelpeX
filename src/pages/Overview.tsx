import ChatPanel from "../components/ChatPanel";
import ActivityFeed from "../components/dashboard/ActivityFeed";
import AutomationList from "../components/dashboard/AutomationList";
import CameraGrid from "../components/dashboard/CameraGrid";
import MetricCard from "../components/dashboard/MetricCard";
import Panel from "../components/dashboard/Panel";
import SecurityOverview from "../components/dashboard/SecurityOverview";
import SystemStatus from "../components/dashboard/SystemStatus";
import {
  placeholderActivityEvents,
  placeholderAutomations,
  placeholderCameras,
  placeholderSecurity,
  placeholderServices,
} from "../data/opsConsole";
import type { OverviewMetric } from "../types/ops";
import { formatPromptGreeting } from "../utils/formatting";

interface OverviewProps {
  activeServerCount: number;
  cameraCount: number;
  onOpenChatPage: () => void;
  onOpenSettings: () => void;
  operatorName: string;
}

export default function Overview({
  activeServerCount,
  cameraCount,
  onOpenChatPage,
  onOpenSettings,
  operatorName,
}: OverviewProps): JSX.Element {
  const firstName = operatorName.split(" ")[0] || operatorName;
  const metrics: OverviewMetric[] = [
    {
      id: "systems",
      label: "Systems",
      value: "8",
      detail: "Online",
      status: "online",
      source: { kind: "placeholder", label: "Placeholder" },
    },
    {
      id: "security",
      label: "Security",
      value: "Normal",
      detail: "No active threats",
      status: "online",
      source: { kind: "placeholder", label: "Placeholder" },
    },
    {
      id: "automations",
      label: "Automations",
      value: `${placeholderAutomations.filter((item) => item.active).length}`,
      detail: "Active",
      status: "online",
      source: { kind: "placeholder", label: "Placeholder" },
    },
    {
      id: "mcp",
      label: "MCP Servers",
      value: `${activeServerCount}`,
      detail: activeServerCount > 0 ? "Connected" : "Disconnected",
      status: activeServerCount > 0 ? "online" : "warning",
      source: { kind: "live", label: "Live" },
    },
    {
      id: "cameras",
      label: "Cameras",
      value: `${cameraCount}`,
      detail: "Integration pending",
      status: "unknown",
      source: { kind: "placeholder", label: "Placeholder" },
    },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border px-6 py-5" style={{ backgroundColor: "var(--surface-panel)", borderColor: "var(--border-panel)" }}>
        <h1 className="text-[40px] font-semibold leading-none" style={{ color: "var(--text-primary)" }}>
          {formatPromptGreeting()}, {firstName}.
        </h1>
        <p className="mt-3 text-lg" style={{ color: "var(--text-secondary)" }}>
          HelpeX is running smoothly. All systems operational.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-5">
        {metrics.map((metric) => (
          <MetricCard key={metric.id} metric={metric} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_340px]">
        <Panel title="Recent Activity" description="The current feed is placeholder-backed until external event buses are wired in.">
          <ActivityFeed events={placeholderActivityEvents} />
        </Panel>

        <Panel title="System Status" description="Service state cards are isolated placeholder data until live health checks are exposed.">
          <SystemStatus services={placeholderServices} />
        </Panel>

        <div className="space-y-4">
          <Panel title="Cameras" actionLabel="View all" description="Camera cards are ready for Frigate stream and detection bindings.">
            <CameraGrid cameras={placeholderCameras} />
          </Panel>

          <Panel title="Security Overview" description="Status summary remains backend-authoritative; React only reflects state.">
            <SecurityOverview security={placeholderSecurity} />
          </Panel>

          <Panel title="Active Automations" actionLabel="View all" description="Toggle visuals are placeholder-only until automation state bindings exist.">
            <AutomationList automations={placeholderAutomations} />
          </Panel>
        </div>
      </div>

      <ChatPanel mode="compact" onOpenChatPage={onOpenChatPage} onOpenSettings={onOpenSettings} />
    </div>
  );
}
