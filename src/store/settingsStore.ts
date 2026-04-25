import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  provider: "openai" | "claude" | "ollama";
  openAiApiKey: string;
  claudeApiKey: string;
  ollamaBaseUrl: string;
  model: string;
  fallbackProvider: "none" | "openai" | "claude" | "ollama";
  fallbackModel: string;
  temperature: number;
  maxTokens: number;
  setProvider: (value: "openai" | "claude" | "ollama") => void;
  setOpenAiApiKey: (value: string) => void;
  setClaudeApiKey: (value: string) => void;
  setOllamaBaseUrl: (value: string) => void;
  setModel: (value: string) => void;
  setFallbackProvider: (value: "none" | "openai" | "claude" | "ollama") => void;
  setFallbackModel: (value: string) => void;
  setTemperature: (value: number) => void;
  setMaxTokens: (value: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      provider: "openai",
      openAiApiKey: "",
      claudeApiKey: "",
      ollamaBaseUrl: "http://127.0.0.1:11434",
      model: "gpt-4o-mini",
      fallbackProvider: "none",
      fallbackModel: "",
      temperature: 0.7,
      maxTokens: 1024,
      setProvider: (value) => set({ provider: value }),
      setOpenAiApiKey: (value) => set({ openAiApiKey: value }),
      setClaudeApiKey: (value) => set({ claudeApiKey: value }),
      setOllamaBaseUrl: (value) => set({ ollamaBaseUrl: value }),
      setModel: (value) => set({ model: value }),
      setFallbackProvider: (value) => set({ fallbackProvider: value }),
      setFallbackModel: (value) => set({ fallbackModel: value }),
      setTemperature: (value) => set({ temperature: value }),
      setMaxTokens: (value) => set({ maxTokens: value })
    }),
    {
      name: "jarvis-settings-v1"
    }
  )
);
