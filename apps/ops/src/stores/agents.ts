import { create } from "zustand";
import type {
  Agent,
  AgentDetail,
  AgentListResponse,
  AgentCreateInput,
  AgentUpdateInput,
} from "@modularmind/api-client";
import { api } from "@modularmind/api-client";
import { createPaginatedState, withLoading, withError, withErrorRethrow } from "./store-helpers";

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
  ...createPaginatedState(),

  fetchAgents: async (page = 1, search = "") => {
    await withLoading(set, async () => {
      const params = new URLSearchParams({ page: String(page), page_size: "20" });
      if (search) params.set("search", search);
      const data = await api.get<AgentListResponse>(`/agents?${params}`);
      set({
        agents: data.items,
        total: data.total,
        page: data.page,
        totalPages: data.total_pages,
      });
    }, "Failed to fetch agents");
  },

  fetchAgent: async (id) => {
    await withLoading(set, async () => {
      const agent = await api.get<AgentDetail>(`/agents/${id}`);
      set({ selectedAgent: agent });
    }, "Failed to fetch agent");
  },

  createAgent: async (data) => {
    return withErrorRethrow(set, async () => {
      const agent = await api.post<AgentDetail>("/agents", data);
      get().fetchAgents(get().page);
      return agent;
    }, "Failed to create agent");
  },

  updateAgent: async (id, data) => {
    await withErrorRethrow(set, async () => {
      const agent = await api.patch<AgentDetail>(`/agents/${id}`, data);
      set({ selectedAgent: agent });
      get().fetchAgents(get().page);
    }, "Failed to update agent");
  },

  deleteAgent: async (id) => {
    await withError(set, async () => {
      await api.delete(`/agents/${id}`);
      get().fetchAgents(get().page);
    }, "Failed to delete agent");
  },

  duplicateAgent: async (id, name) => {
    await withError(set, async () => {
      await api.post(`/agents/${id}/duplicate`, name ? { name } : {});
      get().fetchAgents(get().page);
    }, "Failed to duplicate agent");
  },

  clearError: () => set({ error: null }),
}));
