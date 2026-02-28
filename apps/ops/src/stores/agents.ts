import { create } from "zustand";
import type { Agent, AgentCreate, AgentListResponse } from "@modularmind/api-client";
import { api } from "../lib/api";

interface AgentsState {
  agents: Agent[];
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  search: string;

  fetchAgents: (page?: number) => Promise<void>;
  createAgent: (data: AgentCreate) => Promise<Agent>;
  deleteAgent: (id: string) => Promise<void>;
  duplicateAgent: (id: string) => Promise<Agent>;
  setSearch: (search: string) => void;
  clearError: () => void;
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  agents: [],
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

  createAgent: async (data: AgentCreate) => {
    const agent = await api.post<Agent>("/agents", data);
    get().fetchAgents(get().page);
    return agent;
  },

  deleteAgent: async (id: string) => {
    await api.delete(`/agents/${id}`);
    get().fetchAgents(get().page);
  },

  duplicateAgent: async (id: string) => {
    const agent = await api.post<Agent>(`/agents/${id}/duplicate`);
    get().fetchAgents(get().page);
    return agent;
  },

  setSearch: (search: string) => {
    set({ search });
    get().fetchAgents(1);
  },

  clearError: () => set({ error: null }),
}));
