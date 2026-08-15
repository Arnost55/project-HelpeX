import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Camera,
  LayoutGrid,
  Network,
  ScrollText,
  Search,
  Server,
  Settings,
  Shield,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { AppSection } from "../types/shell";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onSelectSection: (section: AppSection) => void;
}

interface CommandItem {
  id: string;
  label: string;
  description: string;
  icon: typeof Search;
  action: () => void;
  keywords: string[];
}

export default function CommandPalette({
  isOpen,
  onClose,
  onNewChat,
  onOpenSettings,
  onSelectSection,
}: CommandPaletteProps): JSX.Element | null {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        id: "overview",
        label: "Open Overview",
        description: "Go to the operations dashboard",
        icon: LayoutGrid,
        action: () => onSelectSection("overview"),
        keywords: ["overview", "dashboard", "home"],
      },
      {
        id: "chat",
        label: "Open Chat",
        description: "Jump to the full HelpeX chat workspace",
        icon: Bot,
        action: () => onSelectSection("chat"),
        keywords: ["chat", "conversation", "assistant"],
      },
      {
        id: "new-chat",
        label: "New Conversation",
        description: "Start a fresh persisted conversation",
        icon: Bot,
        action: onNewChat,
        keywords: ["new", "conversation", "chat"],
      },
      {
        id: "automations",
        label: "Open Automations",
        description: "Inspect active automation placeholders",
        icon: Sparkles,
        action: () => onSelectSection("automations"),
        keywords: ["automations", "flows", "tasks"],
      },
      {
        id: "tools",
        label: "Open Tools",
        description: "Manage MCP servers and tools",
        icon: Wrench,
        action: () => onSelectSection("tools"),
        keywords: ["tools", "mcp", "integrations"],
      },
      {
        id: "security",
        label: "Open Security",
        description: "Review security posture and events",
        icon: Shield,
        action: () => onSelectSection("security"),
        keywords: ["security", "alarms", "doors"],
      },
      {
        id: "cameras",
        label: "Open Cameras",
        description: "View camera integration placeholders",
        icon: Camera,
        action: () => onSelectSection("cameras"),
        keywords: ["cameras", "frigate", "video"],
      },
      {
        id: "servers",
        label: "Open Servers",
        description: "Check infrastructure and server state",
        icon: Server,
        action: () => onSelectSection("servers"),
        keywords: ["servers", "proxmox", "ubuntu"],
      },
      {
        id: "systems",
        label: "Open Systems",
        description: "Review service health and systems",
        icon: Server,
        action: () => onSelectSection("systems"),
        keywords: ["systems", "services", "status"],
      },
      {
        id: "network",
        label: "Open Network",
        description: "Inspect network and connectivity panels",
        icon: Network,
        action: () => onSelectSection("network"),
        keywords: ["network", "internet", "mqtt"],
      },
      {
        id: "logs",
        label: "Open Logs",
        description: "Browse recent activity and logs",
        icon: ScrollText,
        action: () => onSelectSection("logs"),
        keywords: ["logs", "events", "history"],
      },
      {
        id: "settings",
        label: "Open Settings",
        description: "Adjust providers, integrations, and appearance",
        icon: Settings,
        action: onOpenSettings,
        keywords: ["settings", "preferences", "providers"],
      },
    ],
    [onNewChat, onOpenSettings, onSelectSection],
  );

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setSelectedIndex(0);
    inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const filtered = query.trim()
    ? commands.filter((command) => {
        const value = query.toLowerCase();
        return (
          command.label.toLowerCase().includes(value) ||
          command.keywords.some((keyword) => keyword.includes(value))
        );
      })
    : commands;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center pt-[14vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
      <div
        className="relative w-full max-w-[640px] overflow-hidden rounded-3xl border"
        style={{ backgroundColor: "var(--surface-panel-strong)", borderColor: "var(--border-panel)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b px-4 py-4" style={{ borderColor: "var(--border-panel)" }}>
          <Search size={18} style={{ color: "var(--text-muted)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedIndex((current) => Math.min(current + 1, filtered.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedIndex((current) => Math.max(current - 1, 0));
              } else if (event.key === "Enter" && filtered[selectedIndex]) {
                event.preventDefault();
                filtered[selectedIndex].action();
                onClose();
              } else if (event.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Search pages, actions, and settings"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          <span className="rounded-lg px-2 py-1 text-[11px]" style={{ color: "var(--text-muted)", backgroundColor: "var(--surface-elevated)" }}>
            Esc
          </span>
        </div>

        <div className="max-h-[420px] overflow-y-auto p-3">
          {filtered.map((command, index) => {
            const Icon = command.icon;
            const selected = index === selectedIndex;
            return (
              <button
                key={command.id}
                type="button"
                onClick={() => {
                  command.action();
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className="mb-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left"
                style={{
                  backgroundColor: selected ? "rgba(93, 227, 201, 0.08)" : "transparent",
                  border: selected ? "1px solid var(--border-focus)" : "1px solid transparent",
                }}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: "var(--surface-elevated)", color: selected ? "var(--accent-primary)" : "var(--text-secondary)" }}
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {command.label}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                    {command.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
