import { create } from "zustand";

export type RuntimeActivityCategory =
  | "provider"
  | "mcp"
  | "tool"
  | "approval"
  | "error";

export interface RuntimeActivityItem {
  id: string;
  category: RuntimeActivityCategory;
  title: string;
  summary: string;
  timestampMs: number;
  details?: Record<string, unknown>;
}

interface RuntimeActivityState {
  items: RuntimeActivityItem[];
  push: (item: Omit<RuntimeActivityItem, "id">) => void;
  clear: () => void;
}

const MAX_ACTIVITY_ITEMS = 200;

export const useRuntimeActivityStore = create<RuntimeActivityState>((set) => ({
  items: [],
  push: (item) =>
    set((state) => ({
      items: [
        {
          ...item,
          id: `${item.category}-${item.timestampMs}-${crypto.randomUUID()}`,
        },
        ...state.items,
      ].slice(0, MAX_ACTIVITY_ITEMS),
    })),
  clear: () => set({ items: [] }),
}));
