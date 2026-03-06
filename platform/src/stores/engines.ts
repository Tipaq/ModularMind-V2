"use client";

import { create } from "zustand";
import { paginatedFetch, mutatingFetch } from "./helpers";

export interface PlatformEngineListItem {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  status: string;
  lastSeen: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  client: { id: string; name: string };
}

interface EnginesState {
  engines: PlatformEngineListItem[];
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  search: string;
  statusFilter: string;

  fetchEngines: (page?: number) => Promise<void>;
  deleteEngine: (id: string) => Promise<void>;
  setSearch: (search: string) => void;
  setStatusFilter: (status: string) => void;
  clearError: () => void;
}

export const useEnginesStore = create<EnginesState>((set, get) => ({
  engines: [],
  total: 0,
  page: 1,
  totalPages: 1,
  loading: false,
  error: null,
  search: "",
  statusFilter: "",

  fetchEngines: async (page = 1) => {
    const { search, statusFilter } = get();
    const engines = await paginatedFetch<PlatformEngineListItem>(
      "/api/engines", page, search, "engines", set,
      statusFilter ? { status: statusFilter } : undefined,
    );
    set({ engines });
  },

  deleteEngine: async (id) => {
    await mutatingFetch(`/api/engines/${id}`, "DELETE", "delete engine", set);
    get().fetchEngines(get().page);
  },

  setSearch: (search: string) => set({ search }),
  setStatusFilter: (status: string) => set({ statusFilter: status }),
  clearError: () => set({ error: null }),
}));
