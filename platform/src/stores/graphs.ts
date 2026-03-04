"use client";

import { create } from "zustand";
import { DEFAULT_PAGE_SIZE } from "@/lib/db-utils";

export interface GraphNode {
  id: string;
  type: string;
  label?: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PlatformGraph {
  id: string;
  name: string;
  description: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformGraphListItem {
  id: string;
  name: string;
  description: string;
  node_count: number;
  edge_count: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedResponse {
  items: PlatformGraphListItem[];
  total: number;
  page: number;
  total_pages: number;
}

interface GraphsState {
  graphs: PlatformGraphListItem[];
  selectedGraph: PlatformGraph | null;
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  search: string;

  fetchGraphs: (page?: number) => Promise<void>;
  fetchGraph: (id: string) => Promise<PlatformGraph>;
  createGraph: (data: { name: string; description?: string }) => Promise<PlatformGraph>;
  updateGraph: (id: string, data: Partial<PlatformGraph>) => Promise<PlatformGraph>;
  deleteGraph: (id: string) => Promise<void>;
  duplicateGraph: (id: string) => Promise<PlatformGraph>;
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
      const params = new URLSearchParams({ page: String(page), page_size: String(DEFAULT_PAGE_SIZE) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/graphs?${params}`);
      if (!res.ok) throw new Error("Failed to load graphs");
      const data: PaginatedResponse = await res.json();
      set({
        graphs: data.items,
        total: data.total,
        page: data.page,
        totalPages: data.total_pages,
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
      const res = await fetch(`/api/graphs/${id}`);
      if (!res.ok) throw new Error("Failed to load graph");
      const graph: PlatformGraph = await res.json();
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

  createGraph: async (data) => {
    const res = await fetch("/api/graphs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to create graph");
    const graph: PlatformGraph = await res.json();
    get().fetchGraphs(get().page);
    return graph;
  },

  updateGraph: async (id, data) => {
    const res = await fetch(`/api/graphs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update graph");
    const graph: PlatformGraph = await res.json();
    set({ selectedGraph: graph });
    get().fetchGraphs(get().page);
    return graph;
  },

  deleteGraph: async (id) => {
    const res = await fetch(`/api/graphs/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete graph");
    get().fetchGraphs(get().page);
  },

  duplicateGraph: async (id) => {
    const res = await fetch(`/api/graphs/${id}/duplicate`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to duplicate graph");
    const graph: PlatformGraph = await res.json();
    get().fetchGraphs(get().page);
    return graph;
  },

  setSearch: (search: string) => {
    set({ search });
    get().fetchGraphs(1);
  },

  clearError: () => set({ error: null }),
}));
