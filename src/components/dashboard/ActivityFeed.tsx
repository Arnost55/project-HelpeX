import {
  CheckCircle2,
  PlugZap,
  Server,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type { ActivityEvent } from "../../types/ops";
import { formatClockTime } from "../../utils/formatting";
import SourceBadge from "../ui/SourceBadge";

const CATEGORY_ICONS = {
  security: ShieldAlert,
  automation: Sparkles,
  server: Server,
  network: TriangleAlert,
  mcp: PlugZap,
  system: CheckCircle2,
};

const SEVERITY_COLORS = {
  info: "var(--text-secondary)",
  success: "var(--status-success)",
  warning: "var(--status-warning)",
  critical: "var(--status-danger)",
};

export default function ActivityFeed({ events }: { events: ActivityEvent[] }): JSX.Element {
  return (
    <div className="space-y-2">
      {events.map((event) => {
        const Icon = CATEGORY_ICONS[event.category];
        return (
          <article
            key={event.id}
            className="grid grid-cols-[44px_minmax(0,1fr)_150px_72px] items-start gap-3 rounded-2xl border px-3 py-3"
            style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}
          >
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl border"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "rgba(255,255,255,0.02)",
                color: SEVERITY_COLORS[event.severity],
              }}
            >
              <Icon size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {event.title}
                </p>
                <SourceBadge source={event.sourceMeta} />
              </div>
              {event.description ? (
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                  {event.description}
                </p>
              ) : null}
            </div>
            <p className="truncate text-sm" style={{ color: "var(--text-secondary)" }}>
              {event.source}
            </p>
            <p className="text-right text-sm" style={{ color: "var(--text-muted)" }}>
              {formatClockTime(event.timestamp)}
            </p>
          </article>
        );
      })}
    </div>
  );
}
