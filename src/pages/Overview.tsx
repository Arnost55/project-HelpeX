import { useSettingsStore } from "../store/settingsStore";
import type { OverviewMetric } from "../types/ops";
import MetricCard from "../components/dashboard/MetricCard";
import Panel from "../components/dashboard/Panel";
import { formatPromptGreeting } from "../utils/formatting";

interface OverviewProps {
  connectedServerCount: number;
  availableToolCount: number;
  onOpenChatPage: () => void;
  onOpenSettings: () => void;
  operatorName: string;
}

export default function Overview({
  connectedServerCount,
  availableToolCount,
  onOpenChatPage,
  onOpenSettings,
  operatorName,
}: OverviewProps): JSX.Element {
  const provider = useSettingsStore((state) => state.provider);
  const model = useSettingsStore((state) => state.model);
  const providerHealth = useSettingsStore((state) => state.providerHealth[provider]);
  const firstName = operatorName.split(" ")[0] || operatorName;

  const metrics: OverviewMetric[] = [
    {
      id: "systems",
      label: "Provider",
      value: provider,
      detail: providerHealth?.message ?? "Not checked",
      status: providerHealth?.healthy ? "online" : "unknown",
      source: { kind: "live", label: "Live" },
    },
    {
      id: "security",
      label: "Model",
      value: model || "Unset",
      detail: model ? "Selected" : "Choose a model",
      status: model ? "online" : "warning",
      source: { kind: "live", label: "Live" },
    },
    {
      id: "automations",
      label: "MCP Servers",
      value: `${connectedServerCount}`,
      detail: connectedServerCount > 0 ? "Connected" : "No integrations yet",
      status: connectedServerCount > 0 ? "online" : "warning",
      source: { kind: "live", label: "Live" },
    },
    {
      id: "mcp",
      label: "Available Tools",
      value: `${availableToolCount}`,
      detail: availableToolCount > 0 ? "Agent-ready" : "No tools available",
      status: availableToolCount > 0 ? "online" : "warning",
      source: { kind: "live", label: "Live" },
    },
  ];

  const isFreshState = !model || connectedServerCount === 0;

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border px-6 py-5" style={{ backgroundColor: "var(--surface-panel)", borderColor: "var(--border-panel)" }}>
        <h1 className="text-[40px] font-semibold leading-none" style={{ color: "var(--text-primary)" }}>
          {formatPromptGreeting()}, {firstName}.
        </h1>
        <p className="mt-3 text-lg" style={{ color: "var(--text-secondary)" }}>
          {isFreshState
            ? "HelpeX is ready for real configuration. Choose a provider, select a model, and connect an integration."
            : "HelpeX is configured and ready to chat, discover tools, and execute approved actions."}
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.id} metric={metric} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title="Getting Started" description="HelpeX now reports real provider and MCP runtime state instead of placeholder infrastructure data.">
          <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            <p>1. Configure an AI provider and verify its health.</p>
            <p>2. Discover or enter a model and persist that selection locally.</p>
            <p>3. Add an MCP server to expose real tools to the agent.</p>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={onOpenSettings}
                className="rounded-2xl px-4 py-2 text-sm font-medium"
                style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent-primary)" }}
              >
                Configure AI
              </button>
              <button
                type="button"
                onClick={onOpenChatPage}
                className="rounded-2xl border px-4 py-2 text-sm"
                style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
              >
                Open chat
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="Runtime State" description="These values reflect the currently selected provider and active MCP runtime, not mock dashboard data.">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--text-secondary)" }}>Provider health</span>
              <span style={{ color: "var(--text-primary)" }}>{providerHealth?.message ?? "Unchecked"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--text-secondary)" }}>Latency</span>
              <span style={{ color: "var(--text-primary)" }}>
                {providerHealth?.latencyMs ? `${providerHealth.latencyMs} ms` : "No data"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--text-secondary)" }}>Connected MCP servers</span>
              <span style={{ color: "var(--text-primary)" }}>{connectedServerCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--text-secondary)" }}>Available tools</span>
              <span style={{ color: "var(--text-primary)" }}>{availableToolCount}</span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
