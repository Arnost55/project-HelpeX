import {
  Activity,
  Bot,
  Camera,
  Cog,
  LayoutGrid,
  Network,
  ScrollText,
  Server,
  Shield,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { CoreMetric } from "../../types/ops";
import type { AppSection, NavigationItem } from "../../types/shell";

const NAV_ITEMS: NavigationItem[] = [
  { id: "overview", label: "Overview" },
  { id: "chat", label: "Chat" },
  { id: "automations", label: "Automations" },
  { id: "tools", label: "Tools" },
  { id: "security", label: "Security" },
  { id: "cameras", label: "Cameras" },
  { id: "servers", label: "Servers" },
  { id: "systems", label: "Systems" },
  { id: "network", label: "Network" },
  { id: "logs", label: "Logs" },
];

const NAV_ICONS = {
  overview: LayoutGrid,
  chat: Bot,
  automations: Sparkles,
  tools: Wrench,
  security: Shield,
  cameras: Camera,
  servers: Server,
  systems: Activity,
  network: Network,
  logs: ScrollText,
} satisfies Record<AppSection, typeof LayoutGrid>;

interface SidebarProps {
  activeSection: AppSection;
  coreMetrics: CoreMetric[];
  onSelectSection: (section: AppSection) => void;
  onOpenSettings: () => void;
}

export default function Sidebar({
  activeSection,
  coreMetrics,
  onSelectSection,
  onOpenSettings,
}: SidebarProps): JSX.Element {
  return (
    <aside
      className="flex h-full w-[248px] flex-col border-r"
      style={{ backgroundColor: "var(--surface-panel)", borderColor: "var(--border-panel)" }}
    >
      <div className="flex items-center gap-3 px-5 py-5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl border"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}
        >
          <div className="text-sm font-semibold tracking-[0.28em]" style={{ color: "var(--accent-primary)" }}>
            H
          </div>
        </div>
        <div>
          <p className="text-[15px] font-semibold tracking-[0.2em]" style={{ color: "var(--text-primary)" }}>
            HELPEX
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Personal infrastructure console
          </p>
        </div>
      </div>

      <nav className="flex-1 px-3 pb-4">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = NAV_ICONS[item.id];
            const active = item.id === activeSection;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelectSection(item.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm"
                  style={{
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    backgroundColor: active ? "rgba(93, 227, 201, 0.08)" : "transparent",
                    border: active ? "1px solid var(--border-focus)" : "1px solid transparent",
                  }}
                >
                  <Icon size={17} style={{ color: active ? "var(--accent-primary)" : "var(--text-muted)" }} />
                  <span className="font-medium">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm"
          style={{
            color: "var(--text-secondary)",
            border: "1px solid transparent",
          }}
        >
          <Cog size={17} style={{ color: "var(--text-muted)" }} />
          <span className="font-medium">Settings</span>
        </button>
      </div>

      <div className="px-4 pb-5">
        <div
          className="rounded-2xl border p-4"
          style={{ backgroundColor: "var(--surface-panel-strong)", borderColor: "var(--border-panel)" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                HelpeX Core
              </p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Host telemetry surface
              </p>
            </div>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--status-success)" }} />
          </div>
          <div className="space-y-2.5">
            {coreMetrics.map((metric) => (
              <div key={metric.id} className="flex items-center justify-between text-sm">
                <span style={{ color: "var(--text-secondary)" }}>{metric.label}</span>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {metric.value}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
            CPU and RAM stay unavailable until host telemetry is exposed by the backend.
          </p>
        </div>
      </div>
    </aside>
  );
}
