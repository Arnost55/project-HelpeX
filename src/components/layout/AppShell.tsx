import type { ReactNode } from "react";
import type { CoreMetric } from "../../types/ops";
import type { AppSection } from "../../types/shell";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

interface AppShellProps {
  activeSection: AppSection;
  children: ReactNode;
  coreMetrics: CoreMetric[];
  notificationCount: number;
  systemStatusLabel: string;
  userName: string;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  onSelectSection: (section: AppSection) => void;
}

export default function AppShell({
  activeSection,
  children,
  coreMetrics,
  notificationCount,
  systemStatusLabel,
  userName,
  onOpenCommandPalette,
  onOpenSettings,
  onSelectSection,
}: AppShellProps): JSX.Element {
  return (
    <div className="flex h-screen w-screen overflow-hidden helpex-app-shell">
      <Sidebar
        activeSection={activeSection}
        coreMetrics={coreMetrics}
        onSelectSection={onSelectSection}
        onOpenSettings={onOpenSettings}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          systemStatusLabel={systemStatusLabel}
          notificationCount={notificationCount}
          userName={userName}
          onOpenCommandPalette={onOpenCommandPalette}
          onOpenSettings={onOpenSettings}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
