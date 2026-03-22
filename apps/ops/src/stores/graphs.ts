import { create } from "zustand";
import type {
  Graph,
  GraphListItem,
  PaginatedGraphList,
  GraphCreateInput,
  GraphUpdateInput,
} from "@modularmind/api-client";
import { api } from "../lib/api";

interface GraphsState {
  graphs: GraphListItem[];
  selectedGraph: Graph | null;
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  total: number;

  fetchGraphs: (page?: number, search?: string) => Promise<void>;
  fetchGraph: (id: string) => Promise<void>;
  createGraph: (data: GraphCreateInput) => Promise<Graph>;
  updateGraph: (id: string, data: GraphUpdateInput) => Promise<void>;
  deleteGraph: (id: string) => Promise<void>;
  duplicateGraph: (id: string, name?: string) => Promise<void>;
  clearError: () => void;
}

export const useGraphsStore = create<GraphsState>((set, get) => ({
  graphs: [],
  selectedGraph: null,
  loading: false,
  error: null,
  page: 1,
  totalPages: 1,
  total: 0,

  fetchGraphs: async (page = 1, search = "") => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams({ page: String(page), page_size: "20" });
      if (search) params.set("search", search);
      const data = await api.get<PaginatedGraphList>(`/graphs?${params}`);
      set({
        graphs: data.items,
        total: data.total,
        page: data.page,
        totalPages: data.total_pages,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch graphs" });
    } finally {
      set({ loading: false });
    }
  },

  fetchGraph: async (id) => {
    set({ loading: true, error: null });
    try {
      const graph = await api.get<Graph>(`/graphs/${id}`);
      set({ selectedGraph: graph });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch graph" });
    } finally {
      set({ loading: false });
    }
  },

  createGraph: async (data) => {
    set({ error: null });
    try {
      const graph = await api.post<Graph>("/graphs", data);
      get().fetchGraphs(get().page);
      return graph;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to create graph" });
      throw err;
    }
  },

  updateGraph: async (id, data) => {
    set({ error: null });
    try {
      const graph = await api.patch<Graph>(`/graphs/${id}`, data);
      set({ selectedGraph: graph });
      get().fetchGraphs(get().page);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to update graph" });
      throw err;
    }
  },

  deleteGraph: async (id) => {
    set({ error: null });
    try {
      await api.delete(`/graphs/${id}`);
      get().fetchGraphs(get().page);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to delete graph" });
    }
  },

  duplicateGraph: async (id, name) => {
    set({ error: null });
    try {
      await api.post(`/graphs/${id}/duplicate`, name ? { name } : {});
      get().fetchGraphs(get().page);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to duplicate graph" });
    }
  },

  clearError: () => set({ error: null }),
}));
