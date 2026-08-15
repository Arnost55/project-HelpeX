import { ShieldAlert } from "lucide-react";
import type { ToolApprovalRequest } from "../../store/toolApprovalStore";
import { formatClockTime } from "../../utils/formatting";

interface ToolApprovalCardProps {
  approval: ToolApprovalRequest;
  busy: boolean;
  onDecision: (approvalId: string, allow: boolean) => Promise<void>;
}

export default function ToolApprovalCard({
  approval,
  busy,
  onDecision,
}: ToolApprovalCardProps): JSX.Element {
  const requestedAt = new Date(approval.requestedAtMs).toISOString();
  const expiresAt = new Date(approval.expiresAtMs).toISOString();
  return (
    <article
      className="rounded-2xl border p-4"
      style={{ borderColor: "rgba(245, 158, 11, 0.3)", backgroundColor: "rgba(120, 53, 15, 0.14)" }}
    >
      <div className="mb-3 flex items-start gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: "rgba(245, 158, 11, 0.12)", color: "var(--status-warning)" }}
        >
          <ShieldAlert size={18} />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            HelpeX wants to perform an action
          </p>
          <p className="mt-1 text-base font-medium" style={{ color: "var(--text-primary)" }}>
            {approval.actionLabel}
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Source: {approval.serverName}
          </p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Permission: {approval.permission.level}
          </p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Risk: {approval.riskLevel}
          </p>
        </div>
      </div>
      {approval.description ? (
        <p className="mb-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          {approval.description}
        </p>
      ) : null}
      <div className="mb-3 grid gap-2 rounded-xl border px-3 py-3 text-sm" style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(255,255,255,0.02)" }}>
        <div className="flex items-center justify-between gap-3">
          <span style={{ color: "var(--text-muted)" }}>Action</span>
          <span style={{ color: "var(--text-primary)" }}>{approval.capability.action}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span style={{ color: "var(--text-muted)" }}>Target</span>
          <span style={{ color: "var(--text-primary)" }}>{approval.capability.target}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span style={{ color: "var(--text-muted)" }}>Scope</span>
          <span style={{ color: "var(--text-primary)" }}>{approval.scope.identifier}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span style={{ color: "var(--text-muted)" }}>Requested</span>
          <span style={{ color: "var(--text-primary)" }}>{formatClockTime(requestedAt)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span style={{ color: "var(--text-muted)" }}>Expires</span>
          <span style={{ color: "var(--text-primary)" }}>{formatClockTime(expiresAt)}</span>
        </div>
      </div>
      <pre
        className="mb-3 overflow-x-auto rounded-xl px-3 py-2 text-xs"
        style={{ backgroundColor: "rgba(15, 23, 42, 0.45)", color: "var(--text-secondary)" }}
      >
        {JSON.stringify(approval.arguments, null, 2)}
      </pre>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => void onDecision(approval.approvalId, false)}
          disabled={busy}
          className="rounded-xl border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
        >
          Deny
        </button>
        <button
          type="button"
          onClick={() => void onDecision(approval.approvalId, true)}
          disabled={busy}
          className="rounded-xl px-3 py-2 text-sm font-medium"
          style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent-primary)" }}
        >
          Allow once
        </button>
      </div>
    </article>
  );
}
