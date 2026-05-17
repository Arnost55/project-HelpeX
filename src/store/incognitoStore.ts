import { create } from "zustand";
import { persist } from "zustand/middleware";

interface IncognitoState {
  isIncognito: boolean;
  setIncognito: (value: boolean) => void;
  toggleIncognito: () => void;
}

export const useIncognitoStore = create<IncognitoState>()(
  persist(
    (set) => ({
      isIncognito: false,
      setIncognito: (value) => set({ isIncognito: value }),
      toggleIncognito: () => set((state) => ({ isIncognito: !state.isIncognito }))
    }),
    {
      name: "jarvis-incognito-v1"
    }
  )
);
