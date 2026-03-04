"use client";

import { create } from "zustand";
import { DEFAULT_PAGE_SIZE } from "@/lib/db-utils";

export interface PlatformEngine {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  status: string;
  lastSeen: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformClient {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  _count?: { engines: number };
}

export interface PlatformClientDetail extends PlatformClient {
  engines: PlatformEngine[];
}

interface PaginatedResponse {
  items: PlatformClient[];
  total: number;
  page: number;
  total_pages: number;
}

interface ClientsState {
  clients: PlatformClient[];
  selectedClient: PlatformClientDetail | null;
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  search: string;

  fetchClients: (page?: number) => Promise<void>;
  fetchClient: (id: string) => Promise<void>;
  createClient: (data: { name: string; engineUrl?: string }) => Promise<PlatformClient>;
  updateClient: (id: string, data: { name?: string }) => Promise<PlatformClient>;
  deleteClient: (id: string) => Promise<void>;
  addEngine: (clientId: string, data: { name: string; url?: string }) => Promise<PlatformEngine>;
  deleteEngine: (engineId: string) => Promise<void>;
  setSearch: (search: string) => void;
  clearError: () => void;
}

export const useClientsStore = create<ClientsState>((set, get) => ({
  clients: [],
  selectedClient: null,
  total: 0,
  page: 1,
  totalPages: 1,
  loading: false,
  error: null,
  search: "",

  fetchClients: async (page = 1) => {
    set({ loading: true, error: null });
    try {
      const { search } = get();
      const params = new URLSearchParams({ page: String(page), page_size: String(DEFAULT_PAGE_SIZE) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/clients?${params}`);
      if (!res.ok) throw new Error("Failed to load clients");
      const data: PaginatedResponse = await res.json();
      set({
        clients: data.items,
        total: data.total,
        page: data.page,
        totalPages: data.total_pages,
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load clients",
        loading: false,
      });
    }
  },

  fetchClient: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/clients/${id}`);
      if (!res.ok) throw new Error("Failed to load client");
      const client: PlatformClientDetail = await res.json();
      set({ selectedClient: client, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load client",
        loading: false,
      });
    }
  },

  createClient: async (data) => {
    set({ error: null });
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create client");
      const client: PlatformClient = await res.json();
      get().fetchClients(get().page);
      return client;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create client";
      set({ error: message });
      throw err;
    }
  },

  updateClient: async (id, data) => {
    set({ error: null });
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update client");
      const client: PlatformClient = await res.json();
      // Refresh detail if we're on the detail page
      const selected = get().selectedClient;
      if (selected && selected.id === id) {
        set({ selectedClient: { ...selected, ...client } });
      }
      get().fetchClients(get().page);
      return client;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update client";
      set({ error: message });
      throw err;
    }
  },

  deleteClient: async (id) => {
    set({ error: null });
    try {
      const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete client");
      get().fetchClients(get().page);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to delete client" });
      throw err;
    }
  },

  addEngine: async (clientId, data) => {
    set({ error: null });
    try {
      const res = await fetch(`/api/clients/${clientId}/engines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to add engine");
      const engine: PlatformEngine = await res.json();
      get().fetchClient(clientId);
      return engine;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add engine";
      set({ error: message });
      throw err;
    }
  },

  deleteEngine: async (engineId) => {
    set({ error: null });
    try {
      const res = await fetch(`/api/engines/${engineId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete engine");
      const selected = get().selectedClient;
      if (selected) {
        get().fetchClient(selected.id);
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to delete engine" });
      throw err;
    }
  },

  setSearch: (search: string) => set({ search }),
  clearError: () => set({ error: null }),
}));
