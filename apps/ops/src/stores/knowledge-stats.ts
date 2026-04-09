import { create } from "zustand";
import { api } from "@modularmind/api-client";
import { handleStoreError } from "./store-helpers";
import type { KnowledgeGlobalStats, KnowledgeGraphData } from "./knowledge-types";

interface KnowledgeStatsState {
  globalStats: KnowledgeGlobalStats | null;
  statsLoading: boolean;
  statsError: string | null;

  graphData: KnowledgeGraphData | null;
  graphLoading: boolean;
  graphError: string | null;

  fetchGlobalStats: () => Promise<void>;
  fetchGraphData: () => Promise<void>;
}

export const useKnowledgeStatsStore = create<KnowledgeStatsState>((set) => ({
  globalStats: null,
  statsLoading: false,
  statsError: null,

  graphData: null,
  graphLoading: false,
  graphError: null,

  fetchGlobalStats: async () => {
    set({ statsLoading: true, statsError: null });
    try {
      const data = await api.get<KnowledgeGlobalStats>("/rag/admin/stats/global");
      set({ globalStats: data });
    } catch (err) {
      set({ statsError: handleStoreError(err, "Failed to fetch stats") });
    } finally {
      set({ statsLoading: false });
    }
  },

  fetchGraphData: async () => {
    set({ graphLoading: true, graphError: null });
    try {
      const data = await api.get<KnowledgeGraphData>("/rag/admin/graph?limit=200");
      set({ graphData: data });
    } catch (err) {
      set({ graphError: handleStoreError(err, "Failed to fetch graph") });
    } finally {
      set({ graphLoading: false });
    }
  },
}));
