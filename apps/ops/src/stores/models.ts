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
    } catch {
      // Silently fail
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
    } catch {
      // Non-fatal — browsable models are supplementary
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
      const catalogNames = new Set(catalogRes.models.map((m) => m.model_name));

      const unified: UnifiedCatalogModel[] = catalogRes.models.map((m): CatalogEntry => {
        let unifiedStatus: CatalogEntry["unifiedStatus"] = "ready";
        if (m.model_type === "local") {
          if (m.pull_status === "downloading") unifiedStatus = "downloading";
          else if (m.pull_status === "error") unifiedStatus = "error";
          else if (!m.pull_status || m.pull_status === "pending") unifiedStatus = "not_pulled";
          else unifiedStatus = "ready";
        } else {
          const configured = configs.some(
            (c) => c.provider === m.provider && c.is_configured,
          );
          unifiedStatus = configured ? "ready" : "no_credentials";
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
          if (catalogNames.has(bm.model_name)) continue;

          let unifiedStatus: BrowsableEntry["unifiedStatus"] = "not_pulled";
          if (bm.model_type === "remote") {
            const configured = configs.some(
              (c) => c.provider === bm.provider && c.is_configured,
            );
            unifiedStatus = configured ? "ready" : "no_credentials";
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

  isProviderConfigured: (provider: ModelProvider) => {
    return get().providerConfigs.some(
      (c) => c.provider === provider && c.is_configured,
    );
  },

  setFilters: (filters: Partial<ModelFilters>) => {
    set((state) => ({ filters: { ...state.filters, ...filters } }));
  },
}));
