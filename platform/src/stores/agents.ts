"use client";

import { create } from "zustand";
import { paginatedFetch, mutatingFetch, fetchOne } from "./helpers";

export interface AgentConfig {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  tools?: string[];
  mcpServers?: string[];
  memoryEnabled?: boolean;
  ragEnabled?: boolean;
  [key: string]: unknown;
}

export interface PlatformAgent {
  id: string;
  name: string;
  description: string;
  model: string;
  provider: string;
  config: AgentConfig;
  version: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface AgentsState {
  agents: PlatformAgent[];
  selectedAgent: PlatformAgent | null;
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  search: string;

  fetchAgents: (page?: number) => Promise<void>;
  fetchAgent: (id: string) => Promise<void>;
  createAgent: (data: Partial<PlatformAgent>) => Promise<PlatformAgent>;
  updateAgent: (id: string, data: Partial<PlatformAgent>) => Promise<PlatformAgent>;
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
    const agents = await paginatedFetch<PlatformAgent>("/api/agents", page, get().search, "agents", set);
    set({ agents });
  },

  fetchAgent: async (id) => {
    const agent = await fetchOne<PlatformAgent>(`/api/agents/${id}`, "agent", set);
    set({ selectedAgent: agent });
  },

  createAgent: async (data) => {
    const agent = await mutatingFetch<PlatformAgent>("/api/agents", "POST", "create agent", set, data);
    get().fetchAgents(get().page);
    return agent;
  },

  updateAgent: async (id, data) => {
    const agent = await mutatingFetch<PlatformAgent>(`/api/agents/${id}`, "PATCH", "update agent", set, data);
    set({ selectedAgent: agent });
    get().fetchAgents(get().page);
    return agent;
  },

  deleteAgent: async (id) => {
    await mutatingFetch(`/api/agents/${id}`, "DELETE", "delete agent", set);
    get().fetchAgents(get().page);
  },

  duplicateAgent: async (id) => {
    await mutatingFetch(`/api/agents/${id}/duplicate`, "POST", "duplicate agent", set);
    get().fetchAgents(get().page);
  },

  setSearch: (search: string) => set({ search }),
  clearError: () => set({ error: null }),
}));
