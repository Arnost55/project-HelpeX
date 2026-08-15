import type {
  ActivityEvent,
  AutomationStatus,
  CameraStatus,
  SecuritySnapshot,
  ServiceStatus,
} from "../types/ops";

const placeholderSource = {
  kind: "placeholder" as const,
  label: "Placeholder",
};

export const placeholderActivityEvents: ActivityEvent[] = [
  {
    id: "activity-1",
    title: "Person detected - Front Door",
    description: "Known person: Uncle",
    source: "Frigate",
    timestamp: new Date("2026-08-15T19:42:31Z").toISOString(),
    severity: "success",
    category: "security",
    sourceMeta: placeholderSource,
  },
  {
    id: "activity-2",
    title: "Backup completed successfully",
    source: "Proxmox Backup Server",
    timestamp: new Date("2026-08-15T19:32:10Z").toISOString(),
    severity: "success",
    category: "server",
    sourceMeta: placeholderSource,
  },
  {
    id: "activity-3",
    title: "MCP server connected",
    description: "Tool profile synchronized",
    source: "HelpeX MCP",
    timestamp: new Date("2026-08-15T19:28:44Z").toISOString(),
    severity: "info",
    category: "mcp",
    sourceMeta: placeholderSource,
  },
  {
    id: "activity-4",
    title: "Automation executed",
    description: "Turned on exterior lights",
    source: "HelpeX Automations",
    timestamp: new Date("2026-08-15T19:21:05Z").toISOString(),
    severity: "warning",
    category: "automation",
    sourceMeta: placeholderSource,
  },
  {
    id: "activity-5",
    title: "Server is online",
    source: "ubuntu-server",
    timestamp: new Date("2026-08-15T19:18:33Z").toISOString(),
    severity: "info",
    category: "server",
    sourceMeta: placeholderSource,
  },
];

export const placeholderServices: ServiceStatus[] = [
  { id: "svc-1", name: "Proxmox VE", status: "online", source: placeholderSource },
  { id: "svc-2", name: "Ubuntu Server", status: "online", source: placeholderSource },
  { id: "svc-3", name: "Home Assistant", status: "online", source: placeholderSource },
  { id: "svc-4", name: "Frigate", status: "unknown", source: placeholderSource },
  { id: "svc-5", name: "MQTT Broker", status: "online", source: placeholderSource },
  { id: "svc-6", name: "HelpeX Core", status: "online", source: placeholderSource },
  { id: "svc-7", name: "Database", status: "online", source: placeholderSource },
  { id: "svc-8", name: "Internet", status: "unknown", source: placeholderSource },
];

export const placeholderCameras: CameraStatus[] = [
  {
    id: "camera-1",
    name: "Front Door",
    state: "offline",
    note: "Awaiting Frigate stream binding",
    recentEvent: "Last event 12 min ago",
    source: placeholderSource,
  },
  {
    id: "camera-2",
    name: "Driveway",
    state: "offline",
    note: "Awaiting Frigate stream binding",
    source: placeholderSource,
  },
  {
    id: "camera-3",
    name: "Backyard",
    state: "offline",
    note: "Awaiting Frigate stream binding",
    source: placeholderSource,
  },
  {
    id: "camera-4",
    name: "Garage",
    state: "offline",
    note: "Awaiting Frigate stream binding",
    source: placeholderSource,
  },
];

export const placeholderSecurity: SecuritySnapshot = {
  mode: "Normal",
  summary: "All clear",
  perimeter: "Secure",
  doors: "Locked",
  windows: "Secure",
  motionSensors: "Normal",
  lastEvent: "2 min ago",
  source: placeholderSource,
};

export const placeholderAutomations: AutomationStatus[] = [
  {
    id: "automation-1",
    name: "Evening Security",
    stateLabel: "Placeholder",
    active: true,
    source: placeholderSource,
  },
  {
    id: "automation-2",
    name: "Exterior Lights",
    stateLabel: "Placeholder",
    active: true,
    source: placeholderSource,
  },
  {
    id: "automation-3",
    name: "Night Mode",
    stateLabel: "Placeholder",
    active: true,
    source: placeholderSource,
  },
  {
    id: "automation-4",
    name: "Server Backup",
    stateLabel: "Placeholder",
    active: true,
    source: placeholderSource,
  },
];
