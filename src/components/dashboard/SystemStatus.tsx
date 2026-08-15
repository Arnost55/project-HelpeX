import type { ServiceStatus } from "../../types/ops";
import SourceBadge from "../ui/SourceBadge";
import StatusDot from "../ui/StatusDot";

export default function SystemStatus({ services }: { services: ServiceStatus[] }): JSX.Element {
  return (
    <div className="space-y-2">
      {services.map((service) => (
        <div
          key={service.id}
          className="flex items-center justify-between rounded-2xl border px-3 py-3"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}
        >
          <div className="flex items-center gap-3">
            <StatusDot status={service.status} />
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {service.name}
            </span>
            <SourceBadge source={service.source} />
          </div>
          <span className="text-sm capitalize" style={{ color: "var(--text-secondary)" }}>
            {service.status}
          </span>
        </div>
      ))}
    </div>
  );
}
