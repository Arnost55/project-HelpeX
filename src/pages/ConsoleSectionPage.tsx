import type { ReactNode } from "react";

interface ConsoleSectionPageProps {
  title: string;
  description: string;
  children: ReactNode;
}

export default function ConsoleSectionPage({
  title,
  description,
  children,
}: ConsoleSectionPageProps): JSX.Element {
  return (
    <div className="space-y-4">
      <section className="rounded-3xl border px-6 py-5" style={{ backgroundColor: "var(--surface-panel)", borderColor: "var(--border-panel)" }}>
        <h1 className="text-[34px] font-semibold leading-none" style={{ color: "var(--text-primary)" }}>
          {title}
        </h1>
        <p className="mt-3 text-base" style={{ color: "var(--text-secondary)" }}>
          {description}
        </p>
      </section>
      {children}
    </div>
  );
}
