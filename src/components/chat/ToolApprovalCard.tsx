import { ShieldAlert } from "lucide-react";
import type { ToolApprovalRequest } from "../../store/toolApprovalStore";

interface ToolApprovalCardProps {
  approval: ToolApprovalRequest;
  busy: boolean;
  onDecision: (requestId: string, allow: boolean) => Promise<void>;
}

export default function ToolApprovalCard({
  approval,
  busy,
  onDecision,
}: ToolApprovalCardProps): JSX.Element {
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
            HelpeX wants to execute
          </p>
          <p className="mt-1 text-base font-medium" style={{ color: "var(--text-primary)" }}>
            {approval.toolName}
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            MCP Server: {approval.serverName}
          </p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Permission: {approval.permission.level}
          </p>
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
          onClick={() => void onDecision(approval.requestId, false)}
          disabled={busy}
          className="rounded-xl border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
        >
          Deny
        </button>
        <button
          type="button"
          onClick={() => void onDecision(approval.requestId, true)}
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
