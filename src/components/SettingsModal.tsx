import React, { useEffect } from "react";
import { X } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  children
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-lg"
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-3xl rounded-lg border p-6 shadow-2xl flex flex-col"
        style={{
          backgroundColor: 'var(--bg-panel)',
          borderColor: 'var(--accent-glow)',
          maxHeight: '85vh'
        }}
      >
        <div className="flex items-center justify-between border-b pb-3 mb-4" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <h2 className="text-xl font-bold tracking-wide" style={{ color: 'var(--text-primary)' }}>
            JARVIS Control Configuration
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10 transition-colors"
            style={{ color: 'var(--text-primary)' }}
          >
            <X size={20} />
          </button>
        </div>

        <div
          className="custom-theme-scrollbar overflow-y-auto flex-1 pr-2"
          style={{ maxHeight: '60vh' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
