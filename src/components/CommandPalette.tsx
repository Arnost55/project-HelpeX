import { useEffect, useState, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { MessageSquare, Settings2, Plus, Search, Command, ArrowRight, Wifi, Monitor, Palette } from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  description: string;
  icon: typeof Search;
  action: () => void;
  keywords: string[];
}

export default function CommandPalette(props: {
  onNewChat: () => void;
  onNavigate: (tab: "chat" | "settings", section?: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const openedAtRef = useRef(0);
  const listenerRef = useRef<(() => void) | null>(null);
  const toggleGuardRef = useRef(0);

  const commands: CommandItem[] = [
    { id: "new-chat", label: "New Conversation", description: "Start a fresh chat", icon: Plus, action: () => { props.onNewChat(); setOpen(false); }, keywords: ["new", "chat", "conversation", "fresh"] },
    { id: "chat", label: "Go to Chat", description: "Switch to conversation view", icon: MessageSquare, action: () => { props.onNavigate("chat"); setOpen(false); }, keywords: ["chat", "conversation", "messages"] },
    { id: "settings-ai", label: "AI Engine Settings", description: "Configure provider, model, temperature", icon: Wifi, action: () => { props.onNavigate("settings", "ai"); setOpen(false); }, keywords: ["settings", "ai", "engine", "provider", "model", "temperature"] },
    { id: "settings-integration", label: "Integration Settings", description: "API keys and base URLs", icon: Settings2, action: () => { props.onNavigate("settings", "integration"); setOpen(false); }, keywords: ["settings", "integration", "api", "key", "url"] },
    { id: "settings-appearance", label: "Appearance Settings", description: "Theme, fonts, typography", icon: Palette, action: () => { props.onNavigate("settings", "appearance"); setOpen(false); }, keywords: ["settings", "appearance", "theme", "font", "dark"] },
    { id: "settings-system", label: "System Settings", description: "Hotkeys, tray, behavior", icon: Monitor, action: () => { props.onNavigate("settings", "system"); setOpen(false); }, keywords: ["settings", "system", "hotkey", "tray", "behavior"] },
  ];

  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery("");
    setSelectedIndex(0);
    openedAtRef.current = Date.now();
  }, []);

  const closePalette = useCallback(() => {
    if (Date.now() - openedAtRef.current < 200) return;
    setOpen(false);
  }, []);

  // Single listener with debounce to prevent double-fire from StrictMode
  useEffect(() => {
    let cancelled = false;

    listen("toggle-command-palette", () => {
      const now = Date.now();
      if (now - toggleGuardRef.current < 300) {
        console.log("[CMDPAL] Debounce guard fired — ignoring duplicate toggle event");
        return;
      }
      toggleGuardRef.current = now;

      setOpen((prev) => {
        const next = !prev;
        if (next) {
          setQuery("");
          setSelectedIndex(0);
          openedAtRef.current = Date.now();
        }
        return next;
      });
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        listenerRef.current = unlisten;
      }
    });

    return () => {
      cancelled = true;
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const filtered = query.trim()
    ? commands.filter((cmd) => {
        const q = query.toLowerCase();
        return cmd.label.toLowerCase().includes(q) || cmd.keywords.some((k) => k.includes(q));
      })
    : commands;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }, [filtered, selectedIndex]);

  if (!open) return <></>;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-center pt-[15vh]"
      onClick={closePalette}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[560px] bg-[#161B22] border border-[#30363D] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#30363D]">
          <Search size={16} className="text-[#8B949E] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-sm text-[#F0F6FC] placeholder-[#8B949E] outline-none"
            placeholder="Search commands..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="text-[10px] font-mono text-[#8B949E] bg-[#21262D] px-1.5 py-0.5 rounded border border-[#30363D]">
            <Command size={10} className="inline mr-0.5" />K
          </kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-xs text-[#8B949E]">No commands found</div>
          ) : (
            filtered.map((cmd, i) => {
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.id}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    i === selectedIndex
                      ? "bg-cyan-500/10 text-cyan-400"
                      : "text-[#C9D1D9] hover:bg-[#21262D]"
                  }`}
                  onClick={cmd.action}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <Icon size={16} className="flex-shrink-0 text-[#8B949E]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{cmd.label}</p>
                    <p className={`text-[10px] mt-0.5 ${i === selectedIndex ? "text-cyan-400/60" : "text-[#8B949E]"}`}>
                      {cmd.description}
                    </p>
                  </div>
                  <ArrowRight size={12} className="flex-shrink-0 text-[#8B949E] opacity-0 group-hover:opacity-100" />
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
