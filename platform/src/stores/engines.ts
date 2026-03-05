"use client";

import { create } from "zustand";
import { DEFAULT_PAGE_SIZE } from "@/lib/db-utils";

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

/** Matches platform API pagination shape — platform doesn't depend on api-client. */
interface PaginatedEngineResponse {
  items: PlatformEngineListItem[];
  total: number;
  page: number;
  total_pages: number;
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
    set({ loading: true, error: null });
    try {
      const { search, statusFilter } = get();
      const params = new URLSearchParams({ page: String(page), page_size: String(DEFAULT_PAGE_SIZE) });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/engines?${params}`);
      if (!res.ok) throw new Error("Failed to load engines");
      const data: PaginatedEngineResponse = await res.json();
      set({
        engines: data.items,
        total: data.total,
        page: data.page,
        totalPages: data.total_pages,
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load engines",
        loading: false,
      });
    }
  },

  deleteEngine: async (id) => {
    set({ error: null });
    try {
      const res = await fetch(`/api/engines/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete engine");
      get().fetchEngines(get().page);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to delete engine" });
      throw err;
    }
  },

  setSearch: (search: string) => set({ search }),
  setStatusFilter: (status: string) => set({ statusFilter: status }),
  clearError: () => set({ error: null }),
}));
