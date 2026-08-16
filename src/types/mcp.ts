export interface McpServerEnvironmentEntry {
  name: string;
  value?: string | null;
  secret: boolean;
  secretRef?: string | null;
  configured: boolean;
}

export interface McpPermissionEvaluation {
  level: string;
  decision: string;
  source: string;
}

export interface McpToolView {
  name: string;
  description?: string | null;
  providerSafeAlias: string;
  enabled: boolean;
  permission: McpPermissionEvaluation;
  inputSchema: unknown;
}

export type McpServerStatus =
  | "STOPPED"
  | "STARTING"
  | "INITIALIZING"
  | "CONNECTED"
  | "RESTARTING"
  | "STOPPING"
  | "ERROR"
  | "NEEDS_CREDENTIALS"
  | "DISCONNECTED"
  | "DISABLED";

export interface McpServerView {
  id: string;
  name: string;
  transport: string;
  cmd: string;
  args: string[];
  env: McpServerEnvironmentEntry[];
  enabled: boolean;
  status: McpServerStatus;
  error?: string | null;
  toolCount: number;
  disabledToolCount: number;
  tools: McpToolView[];
}

export interface McpServerConfigInput {
  id?: string | null;
  name: string;
  transport: string;
  cmd: string;
  args: string[];
  env: McpServerEnvironmentEntry[];
  enabled: boolean;
}
