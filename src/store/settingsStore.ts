import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProviderHealthStatus, ProviderId } from "../types/provider";

type ThemeMode = string;

interface ProviderStats {
  successCount: number;
  failureCount: number;
  fallbackCount: number;
  lastUsedAt: string | null;
}

interface ProviderHealthState {
  healthy: boolean;
  message: string;
  latencyMs: number;
  checkedAt: string;
  status: ProviderHealthStatus;
}



interface SettingsState {
  theme: ThemeMode;
  provider: ProviderId;
  openAiApiKey: string;
  claudeApiKey: string;
  groqApiKey: string;
  togetherApiKey: string;
  ollamaBaseUrl: string;
  groqBaseUrl: string;
  togetherBaseUrl: string;
  model: string;
  fallbackProvider: "none" | ProviderId;
  fallbackModel: string;
  temperature: number;
  maxTokens: number;
  providerStats: Record<ProviderId, ProviderStats>;
  providerHealth: Partial<Record<ProviderId, ProviderHealthState>>;
  setProvider: (value: ProviderId) => void;
  setTheme: (value: ThemeMode) => void;
  setOpenAiApiKey: (value: string) => void;
  setClaudeApiKey: (value: string) => void;
  setGroqApiKey: (value: string) => void;
  setTogetherApiKey: (value: string) => void;
  setOllamaBaseUrl: (value: string) => void;
  setGroqBaseUrl: (value: string) => void;
  setTogetherBaseUrl: (value: string) => void;
  setModel: (value: string) => void;
  setFallbackProvider: (value: "none" | ProviderId) => void;
  setFallbackModel: (value: string) => void;
  setTemperature: (value: number) => void;
  setMaxTokens: (value: number) => void;
  markProviderSuccess: (provider: ProviderId, fallbackUsed: boolean) => void;
  markProviderFailure: (provider: ProviderId) => void;
  setProviderHealth: (provider: ProviderId, health: ProviderHealthState) => void;
  resetProviderStats: () => void;
}

const defaultProviderStats = (): Record<ProviderId, ProviderStats> => ({
  openai: {
    successCount: 0,
    failureCount: 0,
    fallbackCount: 0,
    lastUsedAt: null
  },
  claude: {
    successCount: 0,
    failureCount: 0,
    fallbackCount: 0,
    lastUsedAt: null
  },
  ollama: {
    successCount: 0,
    failureCount: 0,
    fallbackCount: 0,
    lastUsedAt: null
  },
  groq: {
    successCount: 0,
    failureCount: 0,
    fallbackCount: 0,
    lastUsedAt: null
  },
  together: {
    successCount: 0,
    failureCount: 0,
    fallbackCount: 0,
    lastUsedAt: null
  }
});

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "default-dark",
      provider: "openai",
      openAiApiKey: "",
      claudeApiKey: "",
      groqApiKey: "",
      togetherApiKey: "",
      ollamaBaseUrl: "http://127.0.0.1:11434",
      groqBaseUrl: "https://api.groq.com/openai/v1/chat/completions",
      togetherBaseUrl: "https://api.together.xyz/v1/chat/completions",
      model: "gpt-4o-mini",
      fallbackProvider: "none",
      fallbackModel: "",
      temperature: 0.7,
      maxTokens: 1024,
      providerStats: defaultProviderStats(),
      providerHealth: {},
      setTheme: (value) => set({ theme: value }),
      setProvider: (value) => set({ provider: value }),
      setOpenAiApiKey: (value) => set({ openAiApiKey: value }),
      setClaudeApiKey: (value) => set({ claudeApiKey: value }),
      setGroqApiKey: (value) => set({ groqApiKey: value }),
      setTogetherApiKey: (value) => set({ togetherApiKey: value }),
      setOllamaBaseUrl: (value) => set({ ollamaBaseUrl: value }),
      setGroqBaseUrl: (value) => set({ groqBaseUrl: value }),
      setTogetherBaseUrl: (value) => set({ togetherBaseUrl: value }),
      setModel: (value) => set({ model: value }),
      setFallbackProvider: (value) => set({ fallbackProvider: value }),
      setFallbackModel: (value) => set({ fallbackModel: value }),
      setTemperature: (value) =>
        set({
          temperature: Number.isFinite(value) ? Math.min(2, Math.max(0, value)) : 0.7
        }),
      setMaxTokens: (value) =>
        set({
          maxTokens: Number.isFinite(value) ? Math.min(8192, Math.max(64, Math.round(value))) : 1024
        }),
      markProviderSuccess: (provider, fallbackUsed) =>
        set((state) => ({
          providerStats: {
            ...state.providerStats,
            [provider]: {
              ...state.providerStats[provider],
              successCount: state.providerStats[provider].successCount + 1,
              fallbackCount: fallbackUsed
                ? state.providerStats[provider].fallbackCount + 1
                : state.providerStats[provider].fallbackCount,
              lastUsedAt: new Date().toISOString()
            }
          }
        })),
      markProviderFailure: (provider) =>
        set((state) => ({
          providerStats: {
            ...state.providerStats,
            [provider]: {
              ...state.providerStats[provider],
              failureCount: state.providerStats[provider].failureCount + 1,
              lastUsedAt: new Date().toISOString()
            }
          }
        })),
      setProviderHealth: (provider, health) =>
        set((state) => ({
          providerHealth: {
            ...state.providerHealth,
            [provider]: health
          }
        })),
      resetProviderStats: () =>
        set({
          providerStats: defaultProviderStats(),
          providerHealth: {}
        })
    }),
    {
      name: "jarvis-settings-v2",
      partialize: (state) => ({
        theme: state.theme,
        provider: state.provider,
        ollamaBaseUrl: state.ollamaBaseUrl,
        groqBaseUrl: state.groqBaseUrl,
        togetherBaseUrl: state.togetherBaseUrl,
        model: state.model,
        fallbackProvider: state.fallbackProvider,
        fallbackModel: state.fallbackModel,
        temperature: state.temperature,
        maxTokens: state.maxTokens,
        providerStats: state.providerStats,
        providerHealth: state.providerHealth,
      })
    }
  )
);
