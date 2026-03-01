"use client";

import { create } from "zustand";

export interface PlatformAgent {
  id: string;
  name: string;
  description: string;
  model: string;
  provider: string;
  config: Record<string, unknown>;
  version: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface PaginatedResponse {
  items: PlatformAgent[];
  total: number;
  page: number;
  total_pages: number;
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
    set({ loading: true, error: null });
    try {
      const { search } = get();
      const params = new URLSearchParams({ page: String(page), page_size: "20" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/agents?${params}`);
      if (!res.ok) throw new Error("Failed to load agents");
      const data: PaginatedResponse = await res.json();
      set({
        agents: data.items,
        total: data.total,
        page: data.page,
        totalPages: data.total_pages,
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
      const res = await fetch(`/api/agents/${id}`);
      if (!res.ok) throw new Error("Failed to load agent");
      const agent: PlatformAgent = await res.json();
      set({ selectedAgent: agent, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load agent",
        loading: false,
      });
    }
  },

  createAgent: async (data) => {
    set({ error: null });
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create agent");
      const agent: PlatformAgent = await res.json();
      get().fetchAgents(get().page);
      return agent;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create agent";
      set({ error: message });
      throw err;
    }
  },

  updateAgent: async (id, data) => {
    set({ error: null });
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update agent");
      const agent: PlatformAgent = await res.json();
      set({ selectedAgent: agent });
      get().fetchAgents(get().page);
      return agent;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update agent";
      set({ error: message });
      throw err;
    }
  },

  deleteAgent: async (id) => {
    set({ error: null });
    try {
      const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete agent");
      get().fetchAgents(get().page);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to delete agent" });
      throw err;
    }
  },

  duplicateAgent: async (id) => {
    set({ error: null });
    try {
      const res = await fetch(`/api/agents/${id}/duplicate`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to duplicate agent");
      get().fetchAgents(get().page);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to duplicate agent" });
      throw err;
    }
  },

  setSearch: (search: string) => set({ search }),
  clearError: () => set({ error: null }),
}));
