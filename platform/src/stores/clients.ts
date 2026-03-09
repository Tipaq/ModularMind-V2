"use client";

import { create } from "zustand";
import { paginatedFetch, mutatingFetch, fetchOne } from "./helpers";

export interface DeploymentConfig {
  proxyPort?: number;
  domain?: string;
  useGpu?: boolean;
  useTraefik?: boolean;
  ollamaEnabled?: boolean;
  monitoringEnabled?: boolean;
  grafanaPort?: number;
  mmVersion?: string;
}

export interface PlatformEngine {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  status: string;
  lastSeen: string | null;
  version: number;
  deploymentConfig: DeploymentConfig | null;
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
  updateEngine: (engineId: string, data: { deploymentConfig?: DeploymentConfig }) => Promise<PlatformEngine>;
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
    const clients = await paginatedFetch<PlatformClient>("/api/clients", page, get().search, "clients", set);
    set({ clients });
  },

  fetchClient: async (id) => {
    const client = await fetchOne<PlatformClientDetail>(`/api/clients/${id}`, "client", set);
    set({ selectedClient: client });
  },

  createClient: async (data) => {
    const client = await mutatingFetch<PlatformClient>("/api/clients", "POST", "create client", set, data);
    get().fetchClients(get().page);
    return client;
  },

  updateClient: async (id, data) => {
    const client = await mutatingFetch<PlatformClient>(`/api/clients/${id}`, "PATCH", "update client", set, data);
    const selected = get().selectedClient;
    if (selected && selected.id === id) {
      set({ selectedClient: { ...selected, ...client } });
    }
    get().fetchClients(get().page);
    return client;
  },

  deleteClient: async (id) => {
    await mutatingFetch(`/api/clients/${id}`, "DELETE", "delete client", set);
    get().fetchClients(get().page);
  },

  addEngine: async (clientId, data) => {
    const engine = await mutatingFetch<PlatformEngine>(`/api/clients/${clientId}/engines`, "POST", "add engine", set, data);
    get().fetchClient(clientId);
    return engine;
  },

  updateEngine: async (engineId, data) => {
    const engine = await mutatingFetch<PlatformEngine>(`/api/engines/${engineId}`, "PATCH", "update engine", set, data);
    const selected = get().selectedClient;
    if (selected) {
      get().fetchClient(selected.id);
    }
    return engine;
  },

  deleteEngine: async (engineId) => {
    await mutatingFetch(`/api/engines/${engineId}`, "DELETE", "delete engine", set);
    const selected = get().selectedClient;
    if (selected) {
      get().fetchClient(selected.id);
    }
  },

  setSearch: (search: string) => set({ search }),
  clearError: () => set({ error: null }),
}));
