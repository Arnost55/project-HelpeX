import type { AutomationStatus } from "../../types/ops";
import SourceBadge from "../ui/SourceBadge";

export default function AutomationList({ automations }: { automations: AutomationStatus[] }): JSX.Element {
  return (
    <div className="space-y-2">
      {automations.map((automation) => (
        <div
          key={automation.id}
          className="flex items-center justify-between rounded-2xl border px-3 py-3"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}
        >
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: automation.active ? "var(--status-success)" : "var(--text-muted)" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {automation.name}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {automation.stateLabel}
              </p>
            </div>
            <SourceBadge source={automation.source} />
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={automation.active}
            className="flex h-7 w-12 items-center rounded-full px-1"
            style={{ backgroundColor: automation.active ? "rgba(93, 227, 201, 0.22)" : "var(--surface-panel-strong)" }}
          >
            <span
              className="h-5 w-5 rounded-full transition-transform"
              style={{
                backgroundColor: automation.active ? "var(--status-success)" : "var(--text-muted)",
                transform: automation.active ? "translateX(18px)" : "translateX(0px)",
              }}
            />
          </button>
        </div>
      ))}
    </div>
  );
}
