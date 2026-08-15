import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  actionLabel?: string;
  children: ReactNode;
  description?: string;
}

export default function Panel({ title, actionLabel, children, description }: PanelProps): JSX.Element {
  return (
    <section
      className="rounded-3xl border p-5"
      style={{ backgroundColor: "var(--surface-panel)", borderColor: "var(--border-panel)" }}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {description}
            </p>
          ) : null}
        </div>
        {actionLabel ? (
          <button type="button" className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {actionLabel}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}
