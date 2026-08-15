import type { HealthState } from "../../types/ops";

const STATUS_COLORS: Record<HealthState, string> = {
  online: "var(--status-success)",
  warning: "var(--status-warning)",
  offline: "var(--status-danger)",
  unknown: "var(--text-muted)",
};

export default function StatusDot({ status }: { status: HealthState }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: STATUS_COLORS[status] }}
    />
  );
}
