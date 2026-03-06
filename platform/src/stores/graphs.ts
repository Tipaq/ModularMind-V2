"use client";

import { create } from "zustand";
import { paginatedFetch, mutatingFetch, fetchOne } from "./helpers";

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
    const graphs = await paginatedFetch<PlatformGraphListItem>("/api/graphs", page, get().search, "graphs", set);
    set({ graphs });
  },

  fetchGraph: async (id) => {
    const graph = await fetchOne<PlatformGraph>(`/api/graphs/${id}`, "graph", set);
    set({ selectedGraph: graph });
    return graph;
  },

  createGraph: async (data) => {
    const graph = await mutatingFetch<PlatformGraph>("/api/graphs", "POST", "create graph", set, data);
    get().fetchGraphs(get().page);
    return graph;
  },

  updateGraph: async (id, data) => {
    const graph = await mutatingFetch<PlatformGraph>(`/api/graphs/${id}`, "PATCH", "update graph", set, data);
    set({ selectedGraph: graph });
    get().fetchGraphs(get().page);
    return graph;
  },

  deleteGraph: async (id) => {
    await mutatingFetch(`/api/graphs/${id}`, "DELETE", "delete graph", set);
    get().fetchGraphs(get().page);
  },

  duplicateGraph: async (id) => {
    const graph = await mutatingFetch<PlatformGraph>(`/api/graphs/${id}/duplicate`, "POST", "duplicate graph", set);
    get().fetchGraphs(get().page);
    return graph;
  },

  setSearch: (search: string) => {
    set({ search });
    get().fetchGraphs(1);
  },

  clearError: () => set({ error: null }),
}));
