import { create } from "zustand";
import type {
  Graph,
  GraphListItem,
  PaginatedGraphList,
  GraphCreateInput,
  GraphUpdateInput,
} from "@modularmind/api-client";
import { api } from "@modularmind/api-client";
import { createPaginatedState, withLoading, withError, withErrorRethrow } from "./store-helpers";

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
  ...createPaginatedState(),

  fetchGraphs: async (page = 1, search = "") => {
    await withLoading(set, async () => {
      const params = new URLSearchParams({ page: String(page), page_size: "20" });
      if (search) params.set("search", search);
      const data = await api.get<PaginatedGraphList>(`/graphs?${params}`);
      set({
        graphs: data.items,
        total: data.total,
        page: data.page,
        totalPages: data.total_pages,
      });
    }, "Failed to fetch graphs");
  },

  fetchGraph: async (id) => {
    await withLoading(set, async () => {
      const graph = await api.get<Graph>(`/graphs/${id}`);
      set({ selectedGraph: graph });
    }, "Failed to fetch graph");
  },

  createGraph: async (data) => {
    return withErrorRethrow(set, async () => {
      const graph = await api.post<Graph>("/graphs", data);
      get().fetchGraphs(get().page);
      return graph;
    }, "Failed to create graph");
  },

  updateGraph: async (id, data) => {
    await withErrorRethrow(set, async () => {
      const graph = await api.patch<Graph>(`/graphs/${id}`, data);
      set({ selectedGraph: graph });
      get().fetchGraphs(get().page);
    }, "Failed to update graph");
  },

  deleteGraph: async (id) => {
    await withError(set, async () => {
      await api.delete(`/graphs/${id}`);
      get().fetchGraphs(get().page);
    }, "Failed to delete graph");
  },

  duplicateGraph: async (id, name) => {
    await withError(set, async () => {
      await api.post(`/graphs/${id}/duplicate`, name ? { name } : {});
      get().fetchGraphs(get().page);
    }, "Failed to duplicate graph");
  },

  clearError: () => set({ error: null }),
}));
