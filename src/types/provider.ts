export type ProviderId = "openai" | "claude" | "ollama" | "groq" | "together";

export interface ProviderCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  dynamicModels: boolean;
  vision: boolean;
  customBaseUrl: boolean;
}

export interface ProviderDefinition {
  id: ProviderId;
  displayName: string;
  apiType: string;
  defaultBaseUrl?: string | null;
  requiresApiKey: boolean;
  supportsModelListing: boolean;
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
  supportsVision: boolean;
  supportsCustomBaseUrl: boolean;
  manualModelEntry: boolean;
  capabilities: ProviderCapabilities;
}

export type ProviderHealthStatus =
  | "healthy"
  | "checking"
  | "unconfigured"
  | "unreachable"
  | "authentication_error"
  | "rate_limited"
  | "misconfigured"
  | "unsupported"
  | "unknown";

export interface ProviderHealth {
  provider: string;
  healthy: boolean;
  message: string;
  latencyMs: number;
  status: ProviderHealthStatus;
}
