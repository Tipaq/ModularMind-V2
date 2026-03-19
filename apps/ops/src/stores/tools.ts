import { create } from "zustand";
import type { ToolDefinition, ToolCategoryInfo } from "@modularmind/api-client";
import { api } from "../lib/api";

interface ToolsState {
  tools: ToolDefinition[];
  categories: ToolCategoryInfo[];
  totalCount: number;
  loading: boolean;
  error: string | null;

  fetchTools: () => Promise<void>;
}

export const useToolsStore = create<ToolsState>((set) => ({
  tools: [],
  categories: [],
  totalCount: 0,
  loading: false,
  error: null,

  fetchTools: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.get<{
        categories: ToolCategoryInfo[];
        tools: ToolDefinition[];
        total_count: number;
      }>("/internal/tools");
      set({
        tools: data.tools,
        categories: data.categories,
        totalCount: data.total_count,
        loading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch tools";
      set({ error: message, loading: false });
    }
  },
}));
