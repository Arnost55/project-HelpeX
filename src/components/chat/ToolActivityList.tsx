import { CheckCircle2, LoaderCircle, ShieldAlert, TriangleAlert } from "lucide-react";
import type { ToolApprovalRequest } from "../../store/toolApprovalStore";
import ToolApprovalCard from "./ToolApprovalCard";

export interface ToolActivityItem {
  key: string;
  label: string;
  status: "running" | "success" | "error";
  summary?: string;
}

interface ToolActivityListProps {
  activities: ToolActivityItem[];
  approvals: ToolApprovalRequest[];
  approvalBusyId?: string | null;
  onApprovalDecision: (approvalId: string, allow: boolean) => Promise<void>;
}

const STATUS_ICON = {
  running: LoaderCircle,
  success: CheckCircle2,
  error: TriangleAlert,
};

const STATUS_COLOR = {
  running: "var(--text-secondary)",
  success: "var(--status-success)",
  error: "var(--status-warning)",
};

export default function ToolActivityList({
  activities,
  approvals,
  approvalBusyId,
  onApprovalDecision,
}: ToolActivityListProps): JSX.Element | null {
  if (activities.length === 0 && approvals.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {approvals.map((approval) => (
        <ToolApprovalCard
          key={approval.approvalId}
          approval={approval}
          busy={approvalBusyId === approval.approvalId}
          onDecision={onApprovalDecision}
        />
      ))}

      {activities.map((activity) => {
        const Icon = STATUS_ICON[activity.status];
        return (
          <div
            key={activity.key}
            className="flex items-start gap-3 rounded-2xl border px-3 py-3"
            style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ backgroundColor: "rgba(255,255,255,0.03)", color: STATUS_COLOR[activity.status] }}
            >
              <Icon size={16} className={activity.status === "running" ? "animate-spin" : ""} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {activity.label}
              </p>
              {activity.summary ? (
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                  {activity.summary}
                </p>
              ) : (
                <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                  {activity.status === "running" ? "Tool in progress..." : "No additional details."}
                </p>
              )}
            </div>
          </div>
        );
      })}

      {approvals.length > 0 && activities.length === 0 ? (
        <div className="flex items-center gap-2 rounded-2xl border px-3 py-3 text-sm" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)", color: "var(--text-secondary)" }}>
          <ShieldAlert size={16} />
          Waiting for an approval decision before the agent can continue.
        </div>
      ) : null}
    </div>
  );
}
