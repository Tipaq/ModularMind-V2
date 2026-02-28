import { create } from "zustand";
import type {
  Graph,
  GraphListItem,
  GraphCreateInput,
  GraphUpdateInput,
  PaginatedGraphList,
} from "@modularmind/api-client";
import { api } from "../lib/api";

interface GraphsState {
  graphs: GraphListItem[];
  selectedGraph: Graph | null;
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  search: string;

  fetchGraphs: (page?: number) => Promise<void>;
  fetchGraph: (id: string) => Promise<Graph>;
  createGraph: (data: GraphCreateInput) => Promise<Graph>;
  updateGraph: (id: string, data: GraphUpdateInput, version?: number) => Promise<Graph>;
  deleteGraph: (id: string) => Promise<void>;
  duplicateGraph: (id: string) => Promise<Graph>;
  setSearch: (search: string) => void;
  clearError: () => void;
}

export const useGraphsStore = create<GraphsState>((set, get) => ({
  graphs: [],
  selectedGraph: null,
  total: 0,
  page: 1,
  totalPages: 1,
  loading: false,
  error: null,
  search: "",

  fetchGraphs: async (page = 1) => {
    set({ loading: true, error: null });
    try {
      const { search } = get();
      const params = new URLSearchParams({ page: String(page), page_size: "20" });
      if (search) params.set("search", search);
      const res = await api.get<PaginatedGraphList>(`/graphs?${params}`);
      set({
        graphs: res.items,
        total: res.total,
        page: res.page,
        totalPages: res.total_pages,
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load graphs",
        loading: false,
      });
    }
  },

  fetchGraph: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const graph = await api.get<Graph>(`/graphs/${id}`);
      set({ selectedGraph: graph, loading: false });
      return graph;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load graph",
        loading: false,
      });
      throw err;
    }
  },

  createGraph: async (data: GraphCreateInput) => {
    const graph = await api.post<Graph>("/graphs", data);
    get().fetchGraphs(get().page);
    return graph;
  },

  updateGraph: async (id: string, data: GraphUpdateInput, version?: number) => {
    const params = version ? `?version=${version}` : "";
    const graph = await api.patch<Graph>(`/graphs/${id}${params}`, data);
    set({ selectedGraph: graph });
    get().fetchGraphs(get().page);
    return graph;
  },

  deleteGraph: async (id: string) => {
    await api.delete(`/graphs/${id}`);
    get().fetchGraphs(get().page);
  },

  duplicateGraph: async (id: string) => {
    const graph = await api.post<Graph>(`/graphs/${id}/duplicate`);
    get().fetchGraphs(get().page);
    return graph;
  },

  setSearch: (search: string) => {
    set({ search });
    get().fetchGraphs(1);
  },

  clearError: () => set({ error: null }),
}));
