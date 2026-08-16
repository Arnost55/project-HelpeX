import { useMemo, useState } from "react";
import { useRuntimeActivityStore, type RuntimeActivityCategory } from "../../store/runtimeActivityStore";

type ActivityFilter = "all" | RuntimeActivityCategory;

const FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "provider", label: "Providers" },
  { id: "mcp", label: "MCP" },
  { id: "tool", label: "Tools" },
  { id: "approval", label: "Approvals" },
  { id: "error", label: "Errors" },
];

function formatTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function tone(category: RuntimeActivityCategory): string {
  switch (category) {
    case "provider":
      return "var(--accent-primary)";
    case "mcp":
      return "var(--status-warning)";
    case "tool":
      return "var(--status-success)";
    case "approval":
      return "var(--text-primary)";
    case "error":
      return "var(--status-danger)";
    default:
      return "var(--text-secondary)";
  }
}

export default function ActivityExplorer(): JSX.Element {
  const items = useRuntimeActivityStore((state) => state.items);
  const clear = useRuntimeActivityStore((state) => state.clear);
  const [filter, setFilter] = useState<ActivityFilter>("all");

  const filtered = useMemo(
    () => items.filter((item) => filter === "all" || item.category === filter),
    [filter, items],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className="rounded-full border px-3 py-1.5 text-xs"
              style={{
                borderColor: filter === item.id ? "var(--border-focus)" : "var(--border-panel)",
                backgroundColor: filter === item.id ? "rgba(93, 227, 201, 0.08)" : "transparent",
                color: filter === item.id ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={clear}
          className="rounded-xl border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
        >
          Clear
        </button>
      </div>

      <div className="space-y-3">
        {filtered.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border px-4 py-3"
            style={{ borderColor: "var(--border-panel)", backgroundColor: "var(--surface-elevated)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone(item.category) }} />
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {item.title}
                  </p>
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                  {item.summary}
                </p>
                {item.details ? (
                  <pre
                    className="mt-3 overflow-x-auto rounded-xl border p-3 text-xs"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--surface-panel)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {JSON.stringify(item.details, null, 2)}
                  </pre>
                ) : null}
              </div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {formatTime(item.timestampMs)}
              </span>
            </div>
          </article>
        ))}

        {filtered.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm"
            style={{ borderColor: "var(--border-panel)", color: "var(--text-muted)" }}
          >
            No runtime events match the current filter.
          </div>
        ) : null}
      </div>
    </div>
  );
}
