export type AppSection =
  | "overview"
  | "chat"
  | "automations"
  | "tools"
  | "security"
  | "cameras"
  | "servers"
  | "systems"
  | "network"
  | "logs";

export interface NavigationItem {
  id: AppSection;
  label: string;
}
