import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
type SettingsTab = "ai" | "integration" | "appearance" | "system";

interface NavItem {
  id: SettingsTab;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "ai", label: "AI Engine" },
  { id: "integration", label: "Integration" },
  { id: "appearance", label: "Appearance" },
  { id: "system", label: "System" },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  children: React.ReactNode;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => panelRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-lg"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-4xl rounded-xl shadow-2xl flex flex-col overflow-hidden outline-none motion-safe:transition-crisp"
        style={{
          backgroundColor: "var(--bg-panel)",
          border: "1px solid var(--border-panel)",
          height: "75vh",
          minHeight: "500px",
          maxHeight: "700px",
        }}
      >
        {/* ---- Header ---- */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border-panel)" }}
        >
          <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
            JARVIS Control Configuration
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md motion-safe:transition-colors duration-150 ease-out hover:bg-[rgba(255,255,255,0.05)]"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ---- Split Pane Body ---- */}
        <div className="flex flex-1 min-h-0">
          {/* Left Nav */}
          <nav
            className="w-[220px] shrink-0 flex flex-col p-3 gap-0.5 overflow-y-auto"
            style={{ borderRight: "1px solid rgba(255,255,255,0.03)" }}
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`
                    w-full text-left px-3 py-2 rounded-lg text-xs font-medium
                    outline-none
                    motion-safe:transition-colors duration-150 ease-out
                  `}
                  style={{
                    color: isActive ? "var(--accent-glow)" : "var(--text-muted)",
                    backgroundColor: isActive
                      ? "var(--accent-soft)"
                      : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      e.currentTarget.style.backgroundColor =
                        "rgba(255,255,255,0.02)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right Content */}
          <div
            className="flex-1 settings-modal-content overflow-y-auto px-6 py-5"
            style={{ backgroundColor: "var(--bg-main)" }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
