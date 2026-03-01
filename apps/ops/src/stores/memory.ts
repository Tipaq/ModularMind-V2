import { create } from "zustand";
import { api } from "../lib/api";

// ---- Types ----

export interface MemoryEntry {
  id: string;
  scope: string;
  scope_id: string;
  tier: string;
  memory_type: string;
  content: string;
  importance: number;
  access_count: number;
  last_accessed: string | null;
  expired_at: string | null;
  metadata: Record<string, unknown>;
  user_id: string | null;
  created_at: string;
}

export interface GlobalMemoryStats {
  total_entries: number;
  entries_by_type: Record<string, number>;
  entries_by_tier: Record<string, number>;
  entries_by_scope: Record<string, number>;
  avg_importance: number;
  total_accesses: number;
  last_consolidation: string | null;
  entries_decayed_last_cycle: number;
}

export interface ConsolidationLog {
  id: string;
  scope: string;
  scope_id: string;
  action: string;
  source_entry_ids: string[];
  result_entry_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface GraphNode {
  id: string;
  content: string;
  memory_type: string;
  scope: string;
  importance: number;
  access_count: number;
  entities: string[];
  created_at: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  edge_type: string;
  weight: number;
  shared_entities: string[];
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface MemoryUser {
  user_id: string;
  memory_count: number;
}

interface MemoryFilters {
  scope: string;
  memory_type: string;
  tier: string;
  user_id: string;
  include_expired: boolean;
}

interface PaginatedMemoryResponse {
  items: MemoryEntry[];
  total: number;
  page: number;
  page_size: number;
}

interface PaginatedLogsResponse {
  items: ConsolidationLog[];
  total: number;
  page: number;
  page_size: number;
}

// ---- Store ----

interface MemoryState {
  // Global stats
  globalStats: GlobalMemoryStats | null;
  statsLoading: boolean;
  statsError: string | null;

  // Explorer
  entries: MemoryEntry[];
  entriesTotal: number;
  entriesPage: number;
  entriesLoading: boolean;
  entriesError: string | null;
  filters: MemoryFilters;

  // Graph
  graphData: GraphData | null;
  graphLoading: boolean;
  graphError: string | null;

  // Consolidation
  consolLogs: ConsolidationLog[];
  consolTotal: number;
  consolPage: number;
  consolLoading: boolean;
  consolError: string | null;

  // Users (for filter dropdown)
  memoryUsers: MemoryUser[];

  // Actions
  fetchGlobalStats: () => Promise<void>;
  fetchEntries: (page?: number) => Promise<void>;
  fetchGraphData: () => Promise<void>;
  fetchConsolidationLogs: (page?: number) => Promise<void>;
  fetchMemoryUsers: () => Promise<void>;
  invalidateEntry: (entryId: string) => Promise<void>;
  setFilters: (filters: Partial<MemoryFilters>) => void;
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  globalStats: null,
  statsLoading: false,
  statsError: null,

  entries: [],
  entriesTotal: 0,
  entriesPage: 1,
  entriesLoading: false,
  entriesError: null,
  filters: {
    scope: "",
    memory_type: "",
    tier: "",
    user_id: "",
    include_expired: false,
  },

  graphData: null,
  graphLoading: false,
  graphError: null,

  consolLogs: [],
  consolTotal: 0,
  consolPage: 1,
  consolLoading: false,
  consolError: null,

  memoryUsers: [],

  fetchGlobalStats: async () => {
    set({ statsLoading: true, statsError: null });
    try {
      const data = await api.get<GlobalMemoryStats>("/memory/admin/stats/global");
      set({ globalStats: data });
    } catch (err) {
      set({ statsError: err instanceof Error ? err.message : "Failed to fetch stats" });
    } finally {
      set({ statsLoading: false });
    }
  },

  fetchEntries: async (page = 1) => {
    set({ entriesLoading: true, entriesError: null });
    try {
      const { filters } = get();
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
      });
      if (filters.scope) params.set("scope", filters.scope);
      if (filters.memory_type) params.set("memory_type", filters.memory_type);
      if (filters.tier) params.set("tier", filters.tier);
      if (filters.user_id) params.set("user_id", filters.user_id);
      if (filters.include_expired) params.set("include_expired", "true");

      const data = await api.get<PaginatedMemoryResponse>(
        `/memory/admin/explore?${params}`,
      );
      set({
        entries: data.items,
        entriesTotal: data.total,
        entriesPage: data.page,
      });
    } catch (err) {
      set({ entriesError: err instanceof Error ? err.message : "Failed to fetch entries" });
    } finally {
      set({ entriesLoading: false });
    }
  },

  fetchGraphData: async () => {
    set({ graphLoading: true, graphError: null });
    try {
      const data = await api.get<GraphData>("/memory/admin/graph?limit=500&edge_limit=2000");
      set({ graphData: data });
    } catch (err) {
      set({ graphError: err instanceof Error ? err.message : "Failed to fetch graph" });
    } finally {
      set({ graphLoading: false });
    }
  },

  fetchConsolidationLogs: async (page = 1) => {
    set({ consolLoading: true, consolError: null });
    try {
      const data = await api.get<PaginatedLogsResponse>(
        `/memory/admin/consolidation/logs?page=${page}&page_size=20`,
      );
      set({
        consolLogs: data.items,
        consolTotal: data.total,
        consolPage: data.page,
      });
    } catch (err) {
      set({ consolError: err instanceof Error ? err.message : "Failed to fetch logs" });
    } finally {
      set({ consolLoading: false });
    }
  },

  fetchMemoryUsers: async () => {
    try {
      const data = await api.get<MemoryUser[]>("/memory/admin/users");
      set({ memoryUsers: data });
    } catch {
      // Non-fatal
    }
  },

  invalidateEntry: async (entryId: string) => {
    try {
      await api.post(`/memory/admin/${entryId}/invalidate`, {});
      // Refresh entries
      await get().fetchEntries(get().entriesPage);
      await get().fetchGlobalStats();
    } catch (err) {
      set({ entriesError: err instanceof Error ? err.message : "Failed to invalidate entry" });
    }
  },

  setFilters: (newFilters: Partial<MemoryFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
  },
}));
