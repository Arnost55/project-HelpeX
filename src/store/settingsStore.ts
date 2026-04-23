import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  openAiApiKey: string;
  model: string;
  setOpenAiApiKey: (value: string) => void;
  setModel: (value: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      openAiApiKey: "",
      model: "gpt-4o-mini",
      setOpenAiApiKey: (value) => set({ openAiApiKey: value }),
      setModel: (value) => set({ model: value })
    }),
    {
      name: "jarvis-settings-v1"
    }
  )
);
