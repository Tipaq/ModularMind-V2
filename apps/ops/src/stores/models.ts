import { create } from "zustand";
import type {
  CatalogModel,
  PaginatedCatalog,
  UnifiedCatalogModel,
  CatalogEntry,
  BrowsableEntry,
  BrowsableModel,
  ProviderConfig,
  ModelProvider,
} from "@modularmind/api-client";
import { api } from "../lib/api";

interface ModelFilters {
  search: string;
  provider: string;
  type: string;
  status: string;
}

interface ModelsState {
  // Data
  catalogModels: CatalogModel[];
  browsableModels: Record<string, BrowsableModel[]>;
  unifiedCatalog: UnifiedCatalogModel[];
  providerConfigs: ProviderConfig[];

  // Pagination/Meta
  total: number;
  page: number;
  totalPages: number;

  // UI State
  loading: boolean;
  error: string | null;
  browsableLoading: boolean;
  filters: ModelFilters;

  // Actions
  fetchCatalog: (page?: number) => Promise<void>;
  fetchUnifiedCatalog: () => Promise<void>;
  fetchProviderConfigs: () => Promise<void>;
  fetchBrowsable: (provider?: string) => Promise<void>;
  addToCatalog: (model: BrowsableModel) => Promise<void>;
  triggerPull: (body: {
    model_name: string;
    display_name?: string;
    parameter_size?: string;
    disk_size?: string;
    context_window?: number;
  }) => Promise<void>;
  cancelPull: (modelName: string) => Promise<void>;
  removeFromCatalog: (id: string) => Promise<void>;
  pollDownloadProgress: () => Promise<void>;
  isProviderConfigured: (provider: ModelProvider) => boolean;
  setFilters: (filters: Partial<ModelFilters>) => void;
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  catalogModels: [],
  browsableModels: {},
  unifiedCatalog: [],
  providerConfigs: [],
  total: 0,
  page: 1,
  totalPages: 1,
  loading: false,
  error: null,
  browsableLoading: false,
  filters: { search: "", provider: "", type: "", status: "" },

  fetchCatalog: async (page = 1) => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams({ page: String(page), page_size: "100" });
      const data = await api.get<PaginatedCatalog>(`/models/catalog?${params}`);
      set({
        catalogModels: data.models,
        total: data.total,
        page: data.page,
        totalPages: data.total_pages,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch catalog" });
    } finally {
      set({ loading: false });
    }
  },

  fetchProviderConfigs: async () => {
    try {
      const configs = await api.get<ProviderConfig[]>("/models/providers");
      set({ providerConfigs: configs });
    } catch (err) {
      console.error("[models] Failed to fetch provider configs:", err);
    }
  },

  fetchBrowsable: async (provider?: string) => {
    set({ browsableLoading: true });
    try {
      const url = provider
        ? `/models/browse?provider=${encodeURIComponent(provider)}`
        : "/models/browse";
      const data = await api.get<Record<string, BrowsableModel[]>>(url);
      set({ browsableModels: data });
    } catch (err) {
      console.error("[models] Failed to fetch browsable models:", err);
    } finally {
      set({ browsableLoading: false });
    }
  },

  addToCatalog: async (model: BrowsableModel) => {
    try {
      await api.post("/models/pull", {
        model_name: model.model_name,
        display_name: model.display_name,
        parameter_size: model.size,
        disk_size: model.disk_size,
        context_window: model.context_window,
      });
      await get().fetchUnifiedCatalog();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to add model" });
    }
  },

  fetchUnifiedCatalog: async () => {
    set({ loading: true, error: null });
    try {
      // Fetch catalog, providers, and browsable models in parallel
      const [catalogRes, configs, browsable] = await Promise.all([
        api.get<PaginatedCatalog>("/models/catalog?page_size=200"),
        api.get<ProviderConfig[]>("/models/providers").catch(() => [] as ProviderConfig[]),
        api.get<Record<string, BrowsableModel[]>>("/models/browse").catch(
          () => ({}) as Record<string, BrowsableModel[]>,
        ),
      ]);

      set({
        catalogModels: catalogRes.models,
        providerConfigs: configs,
        browsableModels: browsable,
      });

      // Build unified catalog from catalog models
      // Normalize names (strip ":latest") so "nomic-embed-text" matches "nomic-embed-text:latest"
      const normalize = (n: string) => n.replace(/:latest$/, "");
      const catalogNames = new Set(catalogRes.models.map((m) => normalize(m.model_name)));

      const configuredProviders = new Set(
        configs.filter((c) => c.is_configured).map((c) => c.provider),
      );

      const unified: UnifiedCatalogModel[] = catalogRes.models.map((m): CatalogEntry => {
        let unifiedStatus: CatalogEntry["unifiedStatus"] = "ready";
        if (m.model_type === "local") {
          if (m.pull_status === "downloading") unifiedStatus = "downloading";
          else if (m.pull_status === "error") unifiedStatus = "error";
          else if (!m.pull_status || m.pull_status === "pending") unifiedStatus = "not_pulled";
          else unifiedStatus = "ready";
        } else {
          unifiedStatus = configuredProviders.has(m.provider) ? "ready" : "no_credentials";
        }
        return {
          id: m.id,
          provider: m.provider,
          model_name: m.model_name,
          name: m.display_name || m.model_name,
          size: m.size,
          disk_size: m.disk_size,
          context_window: m.context_window,
          model_type: m.model_type,
          unifiedStatus,
          source: "catalog",
          data: m,
        };
      });

      // Merge browsable models not already in catalog
      for (const models of Object.values(browsable)) {
        for (const bm of models) {
          if (catalogNames.has(normalize(bm.model_name))) continue;

          let unifiedStatus: BrowsableEntry["unifiedStatus"] = "not_pulled";
          if (bm.model_type === "remote") {
            unifiedStatus = configuredProviders.has(bm.provider) ? "ready" : "no_credentials";
          }

          unified.push({
            id: `browse-${bm.provider}-${bm.model_name}`,
            provider: bm.provider,
            model_name: bm.model_name,
            name: bm.display_name || bm.model_name,
            size: bm.size,
            disk_size: bm.disk_size,
            context_window: bm.context_window,
            model_type: bm.model_type,
            unifiedStatus,
            source: "browsable",
            data: bm,
          });
        }
      }

      set({ unifiedCatalog: unified });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch models" });
    } finally {
      set({ loading: false });
    }
  },

  triggerPull: async (body) => {
    try {
      await api.post("/models/pull", body);
      await get().fetchUnifiedCatalog();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to pull model" });
    }
  },

  cancelPull: async (modelName: string) => {
    try {
      await api.delete(`/models/pull/${encodeURIComponent(modelName)}`);
      await get().fetchUnifiedCatalog();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to cancel pull" });
    }
  },

  removeFromCatalog: async (id: string) => {
    try {
      await api.delete(`/models/catalog/${id}`);
      await get().fetchUnifiedCatalog();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to remove model" });
    }
  },

  pollDownloadProgress: async () => {
    const { unifiedCatalog } = get();
    const downloading = unifiedCatalog.filter(
      (m) => m.source === "catalog" && m.data.pull_status === "downloading",
    );
    if (downloading.length === 0) return;

    const results = await Promise.all(
      downloading.map(async (m) => {
        try {
          const data = await api.get<{ status: string; progress?: string; error?: string }>(
            `/models/pull/${encodeURIComponent(m.model_name)}/status`,
          );
          return { model_name: m.model_name, data };
        } catch (err) {
          console.error("[models] Failed to poll pull status:", err);
          return null;
        }
      }),
    );

    const progressMap = new Map<string, { status: string; progress?: string; error?: string }>();
    for (const r of results) {
      if (r) progressMap.set(r.model_name, r.data);
    }
    if (progressMap.size === 0) return;

    let needsFullRefresh = false;
    const updated = unifiedCatalog.map((m) => {
      if (m.source !== "catalog") return m;
      const prog = progressMap.get(m.model_name);
      if (!prog) return m;

      const newStatus = prog.status;
      // If download finished or errored, flag for a full refresh to get final state
      if (newStatus !== "downloading" && newStatus !== m.data.pull_status) {
        needsFullRefresh = true;
        return m;
      }

      const newProgress = prog.progress ? parseInt(prog.progress, 10) : 0;
      // Skip update if nothing changed
      if (m.data.pull_progress === newProgress && m.data.pull_status === newStatus) return m;

      const updatedData = { ...m.data, pull_status: newStatus as CatalogModel["pull_status"], pull_progress: newProgress };
      return { ...m, data: updatedData } as UnifiedCatalogModel;
    });

    if (needsFullRefresh) {
      await get().fetchUnifiedCatalog();
    } else {
      set({ unifiedCatalog: updated });
    }
  },

  isProviderConfigured: (provider: ModelProvider) => {
    return get().providerConfigs.some(
      (c) => c.provider === provider && c.is_configured,
    );
  },

  setFilters: (filters: Partial<ModelFilters>) => {
    set((state) => ({ filters: { ...state.filters, ...filters } }));
  },
}));
