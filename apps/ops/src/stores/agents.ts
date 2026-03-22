import { create } from "zustand";
import type {
  Agent,
  AgentDetail,
  AgentListResponse,
  AgentCreateInput,
  AgentUpdateInput,
} from "@modularmind/api-client";
import { api } from "../lib/api";

interface AgentsState {
  agents: Agent[];
  selectedAgent: AgentDetail | null;
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  total: number;

  fetchAgents: (page?: number, search?: string) => Promise<void>;
  fetchAgent: (id: string) => Promise<void>;
  createAgent: (data: AgentCreateInput) => Promise<AgentDetail>;
  updateAgent: (id: string, data: AgentUpdateInput) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
  duplicateAgent: (id: string, name?: string) => Promise<void>;
  clearError: () => void;
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  agents: [],
  selectedAgent: null,
  loading: false,
  error: null,
  page: 1,
  totalPages: 1,
  total: 0,

  fetchAgents: async (page = 1, search = "") => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams({ page: String(page), page_size: "20" });
      if (search) params.set("search", search);
      const data = await api.get<AgentListResponse>(`/agents?${params}`);
      set({
        agents: data.items,
        total: data.total,
        page: data.page,
        totalPages: data.total_pages,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch agents" });
    } finally {
      set({ loading: false });
    }
  },

  fetchAgent: async (id) => {
    set({ loading: true, error: null });
    try {
      const agent = await api.get<AgentDetail>(`/agents/${id}`);
      set({ selectedAgent: agent });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch agent" });
    } finally {
      set({ loading: false });
    }
  },

  createAgent: async (data) => {
    set({ error: null });
    try {
      const agent = await api.post<AgentDetail>("/agents", data);
      get().fetchAgents(get().page);
      return agent;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to create agent" });
      throw err;
    }
  },

  updateAgent: async (id, data) => {
    set({ error: null });
    try {
      const agent = await api.patch<AgentDetail>(`/agents/${id}`, data);
      set({ selectedAgent: agent });
      get().fetchAgents(get().page);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to update agent" });
      throw err;
    }
  },

  deleteAgent: async (id) => {
    set({ error: null });
    try {
      await api.delete(`/agents/${id}`);
      get().fetchAgents(get().page);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to delete agent" });
    }
  },

  duplicateAgent: async (id, name) => {
    set({ error: null });
    try {
      await api.post(`/agents/${id}/duplicate`, name ? { name } : {});
      get().fetchAgents(get().page);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to duplicate agent" });
    }
  },

  clearError: () => set({ error: null }),
}));
