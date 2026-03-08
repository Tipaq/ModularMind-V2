"use client";

import { create } from "zustand";
import { paginatedFetch, mutatingFetch, fetchOne } from "./helpers";

export interface AutomationConfig {
  trigger?: {
    type?: string;
    interval_seconds?: number;
    source?: string;
    github_token_ref?: string;
    repos?: string[];
  };
  triage?: {
    enabled?: boolean;
    simple_threshold?: {
      max_files?: number;
      max_lines?: number;
    };
  };
  execution?: {
    agent_id?: string;
    graph_id?: string;
    model_override?: string | null;
    timeout_seconds?: number;
  };
  post_actions?: Array<{
    type: string;
    on: string;
    method?: string;
    url?: string;
  }>;
  settings?: {
    dry_run?: boolean;
    max_per_cycle?: number;
    skip_labels?: string[];
    require_labels?: string[];
    branches?: string[];
  };
  [key: string]: unknown;
}

export interface PlatformAutomation {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  config: AutomationConfig;
  version: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface AutomationsState {
  automations: PlatformAutomation[];
  selectedAutomation: PlatformAutomation | null;
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  search: string;

  fetchAutomations: (page?: number) => Promise<void>;
  fetchAutomation: (id: string) => Promise<void>;
  createAutomation: (data: Partial<PlatformAutomation>) => Promise<PlatformAutomation>;
  updateAutomation: (id: string, data: Partial<PlatformAutomation>) => Promise<PlatformAutomation>;
  deleteAutomation: (id: string) => Promise<void>;
  duplicateAutomation: (id: string) => Promise<void>;
  toggleAutomation: (id: string, enabled: boolean) => Promise<void>;
  triggerAutomation: (id: string) => Promise<void>;
  setSearch: (search: string) => void;
  clearError: () => void;
}

export const useAutomationsStore = create<AutomationsState>((set, get) => ({
  automations: [],
  selectedAutomation: null,
  total: 0,
  page: 1,
  totalPages: 1,
  loading: false,
  error: null,
  search: "",

  fetchAutomations: async (page = 1) => {
    const automations = await paginatedFetch<PlatformAutomation>(
      "/api/automations", page, get().search, "automations", set,
    );
    set({ automations });
  },

  fetchAutomation: async (id) => {
    const automation = await fetchOne<PlatformAutomation>(
      `/api/automations/${id}`, "automation", set,
    );
    set({ selectedAutomation: automation });
  },

  createAutomation: async (data) => {
    const automation = await mutatingFetch<PlatformAutomation>(
      "/api/automations", "POST", "create automation", set, data,
    );
    get().fetchAutomations(get().page);
    return automation;
  },

  updateAutomation: async (id, data) => {
    const automation = await mutatingFetch<PlatformAutomation>(
      `/api/automations/${id}`, "PATCH", "update automation", set, data,
    );
    set({ selectedAutomation: automation });
    get().fetchAutomations(get().page);
    return automation;
  },

  deleteAutomation: async (id) => {
    await mutatingFetch(`/api/automations/${id}`, "DELETE", "delete automation", set);
    get().fetchAutomations(get().page);
  },

  duplicateAutomation: async (id) => {
    await mutatingFetch(`/api/automations/${id}/duplicate`, "POST", "duplicate automation", set);
    get().fetchAutomations(get().page);
  },

  toggleAutomation: async (id, enabled) => {
    await mutatingFetch<PlatformAutomation>(
      `/api/automations/${id}`, "PATCH", "toggle automation", set, { enabled },
    );
    const selected = get().selectedAutomation;
    if (selected?.id === id) {
      set({ selectedAutomation: { ...selected, enabled } });
    }
    get().fetchAutomations(get().page);
  },

  triggerAutomation: async (id) => {
    await mutatingFetch(`/api/automations/${id}/trigger`, "POST", "trigger automation", set);
  },

  setSearch: (search: string) => set({ search }),
  clearError: () => set({ error: null }),
}));
