import { invoke } from "@tauri-apps/api/core";

export interface ThemeDefinition {
  id: string;
  label: string;
  isCustom: boolean;
  colors: Record<string, string>;
}

interface JarvisTaskRequest {
  taskType: string;
  text: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export async function runJarvisTask(request: JarvisTaskRequest): Promise<string> {
  return invoke("run_jarvis_task", { request });
}

export async function getAvailableThemes(): Promise<ThemeDefinition[]> {
  return invoke("list_available_themes");
}
