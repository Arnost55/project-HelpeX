import type { DataSourceMeta } from "../../types/ops";

export default function SourceBadge({ source }: { source: DataSourceMeta }): JSX.Element {
  const live = source.kind === "live";

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em]"
      style={{
        color: live ? "var(--accent-primary)" : "var(--text-muted)",
        backgroundColor: live ? "var(--accent-soft)" : "var(--surface-elevated)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {source.label}
    </span>
  );
}
