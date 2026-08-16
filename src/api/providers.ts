import { invoke } from "@tauri-apps/api/core";
import type { ProviderDefinition, ProviderHealth, ProviderId } from "../types/provider";

interface ProviderRequest {
  provider: ProviderId;
  apiKey?: string;
  baseUrl?: string;
}

export async function listSupportedProviders(): Promise<ProviderDefinition[]> {
  return invoke("list_supported_providers");
}

export async function listProviderSecretStatuses(): Promise<Record<string, boolean>> {
  return invoke("list_provider_secret_statuses");
}

export async function storeProviderSecret(provider: ProviderId, apiKey: string): Promise<void> {
  return invoke("store_provider_secret", { provider, apiKey });
}

export async function removeProviderSecret(provider: ProviderId): Promise<void> {
  return invoke("remove_provider_secret", { provider });
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
