export interface McpServerEnvironmentEntry {
  name: string;
  value?: string | null;
  secret: boolean;
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
  | "STARTING"
  | "CONNECTED"
  | "FAILED"
  | "DISCONNECTED"
  | "DISABLED";

export interface McpServerView {
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
  name: string;
  transport: string;
  cmd: string;
  args: string[];
  env: McpServerEnvironmentEntry[];
  enabled: boolean;
}
