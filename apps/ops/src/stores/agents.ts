import { create } from "zustand";
import type { Agent, AgentCreate, AgentUpdate, AgentListResponse } from "@modularmind/api-client";
import { api } from "../lib/api";

interface AgentsState {
  // Data
  agents: Agent[];
  selectedAgent: Agent | null;
  total: number;
  page: number;
  totalPages: number;

  // Loading / error
  loading: boolean;
  error: string | null;

  // Filters
  search: string;

  // Actions
  fetchAgents: (page?: number) => Promise<void>;
  fetchAgent: (id: string) => Promise<void>;
  createAgent: (data: AgentCreate) => Promise<Agent>;
  updateAgent: (id: string, data: AgentUpdate) => Promise<Agent>;
  deleteAgent: (id: string) => Promise<void>;
  duplicateAgent: (id: string) => Promise<void>;
  setSearch: (search: string) => void;
  clearError: () => void;
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  agents: [],
  selectedAgent: null,
  total: 0,
  page: 1,
  totalPages: 1,
  loading: false,
  error: null,
  search: "",

  fetchAgents: async (page = 1) => {
    set({ loading: true, error: null });
    try {
      const { search } = get();
      const params = new URLSearchParams({ page: String(page), page_size: "20" });
      if (search) params.set("search", search);
      const res = await api.get<AgentListResponse>(`/agents?${params}`);
      set({
        agents: res.items,
        total: res.total,
        page: res.page,
        totalPages: res.total_pages,
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load agents",
        loading: false,
      });
    }
  },

  fetchAgent: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const agent = await api.get<Agent>(`/agents/${id}`);
      set({ selectedAgent: agent, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load agent",
        loading: false,
      });
    }
  },

  createAgent: async (data: AgentCreate) => {
    set({ error: null });
    try {
      const agent = await api.post<Agent>("/agents", data);
      const { page } = get();
      get().fetchAgents(page);
      return agent;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create agent";
      set({ error: message });
      throw err;
    }
  },

  updateAgent: async (id: string, data: AgentUpdate) => {
    set({ error: null });
    try {
      const agent = await api.patch<Agent>(`/agents/${id}`, data);
      set({ selectedAgent: agent });
      const { page } = get();
      get().fetchAgents(page);
      return agent;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update agent";
      set({ error: message });
      throw err;
    }
  },

  deleteAgent: async (id: string) => {
    set({ error: null });
    try {
      await api.delete(`/agents/${id}`);
      const { page } = get();
      get().fetchAgents(page);
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to delete agent",
      });
      throw err;
    }
  },

  duplicateAgent: async (id: string) => {
    set({ error: null });
    try {
      await api.post(`/agents/${id}/duplicate`);
      const { page } = get();
      get().fetchAgents(page);
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to duplicate agent",
      });
      throw err;
    }
  },

  setSearch: (search: string) => set({ search }),
  clearError: () => set({ error: null }),
}));
