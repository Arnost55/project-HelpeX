import type { CameraStatus } from "../../types/ops";
import SourceBadge from "../ui/SourceBadge";

export default function CameraGrid({ cameras }: { cameras: CameraStatus[] }): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-3">
      {cameras.map((camera) => (
        <article
          key={camera.id}
          className="overflow-hidden rounded-2xl border"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}
        >
          <div
            className="flex aspect-[4/3] items-end justify-between p-3"
            style={{
              background:
                "radial-gradient(circle at top, rgba(110, 122, 141, 0.18), transparent 45%), linear-gradient(180deg, #161b22 0%, #0b0f14 72%)",
            }}
          >
            <div>
              <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-muted)" }}>
                Preview
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                {camera.note}
              </p>
            </div>
            <SourceBadge source={camera.source} />
          </div>
          <div className="flex items-center justify-between px-3 py-3">
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {camera.name}
              </p>
              {camera.recentEvent ? (
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {camera.recentEvent}
                </p>
              ) : null}
            </div>
            <span
              className="text-xs font-medium uppercase tracking-[0.16em]"
              style={{ color: camera.state === "live" ? "var(--status-success)" : "var(--text-muted)" }}
            >
              {camera.state}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}
