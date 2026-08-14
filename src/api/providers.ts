import { invoke } from "@tauri-apps/api/core";

export interface ProviderHealth {
  provider: string;
  healthy: boolean;
  message: string;
  latencyMs: number;
}

interface ProviderRequest {
  provider: "openai" | "claude" | "ollama" | "groq" | "together";
  apiKey?: string;
  baseUrl?: string;
}

export async function listProviderModels(request: ProviderRequest): Promise<string[]> {
  return invoke("list_provider_models", {
    request: {
      provider: request.provider,
      apiKey: request.apiKey,
      baseUrl: request.baseUrl
    }
  });
}

export async function checkProviderHealth(request: ProviderRequest): Promise<ProviderHealth> {
  return invoke("check_provider_health", {
    request: {
      provider: request.provider,
      apiKey: request.apiKey,
      baseUrl: request.baseUrl
    }
  });
}
