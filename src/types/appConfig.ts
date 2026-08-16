import type { ProviderId } from "./provider";

export interface SetupState {
  completed: boolean;
  version: number;
}

export interface AppConfigView {
  theme: string;
  provider: ProviderId;
  model: string;
  fallbackProvider: "none" | ProviderId;
  fallbackModel: string;
  ollamaBaseUrl: string;
  groqBaseUrl: string;
  togetherBaseUrl: string;
  temperature: number;
  maxTokens: number;
  setup: SetupState;
}
