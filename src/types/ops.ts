export type DataSourceKind = "live" | "placeholder";

export type HealthState = "online" | "warning" | "offline" | "unknown";

export interface DataSourceMeta {
  kind: DataSourceKind;
  label: string;
  detail?: string;
}

export interface OverviewMetric {
  id: string;
  label: string;
  value: string;
  detail: string;
  status: HealthState;
  source: DataSourceMeta;
}

export interface ActivityEvent {
  id: string;
  title: string;
  description?: string;
  source: string;
  timestamp: string;
  severity: "info" | "success" | "warning" | "critical";
  category: "security" | "automation" | "server" | "network" | "mcp" | "system";
  sourceMeta: DataSourceMeta;
}

export interface ServiceStatus {
  id: string;
  name: string;
  status: HealthState;
  source: DataSourceMeta;
}

export interface CameraStatus {
  id: string;
  name: string;
  state: "live" | "offline";
  note: string;
  recentEvent?: string;
  source: DataSourceMeta;
}

export interface SecuritySnapshot {
  mode: string;
  summary: string;
  perimeter: string;
  doors: string;
  windows: string;
  motionSensors: string;
  lastEvent: string;
  source: DataSourceMeta;
}

export interface AutomationStatus {
  id: string;
  name: string;
  stateLabel: string;
  active: boolean;
  source: DataSourceMeta;
}

export interface CoreMetric {
  id: string;
  label: string;
  value: string;
  source: DataSourceMeta;
}
