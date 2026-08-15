import { Bell, Command, Search, Settings } from "lucide-react";

interface TopBarProps {
  systemStatusLabel: string;
  notificationCount: number;
  userName: string;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
}

export default function TopBar({
  systemStatusLabel,
  notificationCount,
  userName,
  onOpenCommandPalette,
  onOpenSettings,
}: TopBarProps): JSX.Element {
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header
      className="flex h-[72px] items-center justify-between border-b px-6"
      style={{ borderColor: "var(--border-panel)", backgroundColor: "rgba(6, 10, 14, 0.86)" }}
    >
      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="flex h-11 min-w-[360px] items-center gap-3 rounded-xl border px-4 text-left"
        style={{ backgroundColor: "var(--surface-panel)", borderColor: "var(--border-panel)" }}
      >
        <Search size={16} style={{ color: "var(--text-muted)" }} />
        <span className="flex-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Search anything...
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px]"
          style={{ color: "var(--text-secondary)", backgroundColor: "var(--surface-elevated)" }}
        >
          <Command size={12} />
          K
        </span>
      </button>

      <div className="flex items-center gap-3">
        <div
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--status-success)" }} />
          {systemStatusLabel}
        </div>

        <button
          type="button"
          className="helpex-icon-button"
          aria-label={`${notificationCount} notifications`}
        >
          <Bell size={16} />
          {notificationCount > 0 ? (
            <span className="helpex-icon-badge">{notificationCount}</span>
          ) : null}
        </button>

        <button
          type="button"
          className="helpex-icon-button"
          aria-label="Open settings"
          onClick={onOpenSettings}
        >
          <Settings size={16} />
        </button>

        <button
          type="button"
          className="flex items-center gap-3 rounded-full border px-2 py-1.5"
          style={{ borderColor: "var(--border-panel)", backgroundColor: "var(--surface-panel)" }}
          aria-label="User profile"
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
            style={{ backgroundColor: "var(--surface-elevated)", color: "var(--text-primary)" }}
          >
            {initials || "HX"}
          </span>
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {userName}
          </span>
        </button>
      </div>
    </header>
  );
}
