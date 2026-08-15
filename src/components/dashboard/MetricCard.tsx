import {
  Camera,
  PlugZap,
  Server,
  Shield,
  Sparkles,
} from "lucide-react";
import type { OverviewMetric } from "../../types/ops";
import SourceBadge from "../ui/SourceBadge";

const ICONS = {
  systems: Server,
  security: Shield,
  automations: Sparkles,
  mcp: PlugZap,
  cameras: Camera,
};

export default function MetricCard({ metric }: { metric: OverviewMetric }): JSX.Element {
  const Icon = ICONS[metric.id as keyof typeof ICONS] ?? Server;

  return (
    <article
      className="rounded-2xl border p-4"
      style={{ backgroundColor: "var(--surface-panel)", borderColor: "var(--border-panel)" }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl border"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}
        >
          <Icon size={18} style={{ color: "var(--text-secondary)" }} />
        </div>
        <SourceBadge source={metric.source} />
      </div>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {metric.label}
      </p>
      <p className="mt-1 text-[29px] font-semibold leading-none" style={{ color: "var(--text-primary)" }}>
        {metric.value}
      </p>
      <p className="mt-2 text-sm" style={{ color: "var(--status-success)" }}>
        {metric.detail}
      </p>
    </article>
  );
}
