import { Shield } from "lucide-react";
import type { SecuritySnapshot } from "../../types/ops";
import SourceBadge from "../ui/SourceBadge";

const ROWS: Array<keyof Pick<
  SecuritySnapshot,
  "perimeter" | "doors" | "windows" | "motionSensors" | "lastEvent"
>> = ["perimeter", "doors", "windows", "motionSensors", "lastEvent"];

const LABELS: Record<(typeof ROWS)[number], string> = {
  perimeter: "Perimeter",
  doors: "Doors",
  windows: "Windows",
  motionSensors: "Motion Sensors",
  lastEvent: "Last Event",
};

export default function SecurityOverview({ security }: { security: SecuritySnapshot }): JSX.Element {
  return (
    <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
      <div className="flex flex-col items-center justify-center rounded-2xl border px-4 py-5" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}>
        <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-full border" style={{ borderColor: "rgba(93, 227, 201, 0.35)", color: "var(--status-success)" }}>
          <Shield size={32} />
        </div>
        <p className="text-2xl font-semibold" style={{ color: "var(--status-success)" }}>
          {security.mode}
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          {security.summary}
        </p>
        <div className="mt-3">
          <SourceBadge source={security.source} />
        </div>
      </div>
      <div className="space-y-2">
        {ROWS.map((key) => (
          <div key={key} className="flex items-center justify-between rounded-2xl border px-3 py-3" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {LABELS[key]}
            </span>
            <span className="text-sm font-medium" style={{ color: key === "lastEvent" ? "var(--text-primary)" : "var(--status-success)" }}>
              {security[key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
