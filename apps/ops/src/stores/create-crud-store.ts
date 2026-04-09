import { create } from "zustand";
import { api } from "@modularmind/api-client";
import { createPaginatedState, withLoading, withError, withErrorRethrow } from "./store-helpers";

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  total_pages: number;
}

interface CrudStoreState<TListItem, TDetail, TCreate, TUpdate> {
  items: TListItem[];
  selectedItem: TDetail | null;
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  total: number;

  fetchItems: (page?: number, search?: string) => Promise<void>;
  fetchItem: (id: string) => Promise<void>;
  createItem: (data: TCreate) => Promise<TDetail>;
  updateItem: (id: string, data: TUpdate) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  duplicateItem: (id: string, name?: string) => Promise<void>;
  clearError: () => void;
}

const DEFAULT_PAGE_SIZE = 20;

interface CrudStoreConfig {
  basePath: string;
  entityName: string;
}

export function createCrudStore<TListItem, TDetail, TCreate, TUpdate>(
  config: CrudStoreConfig,
) {
  const { basePath, entityName } = config;

  return create<CrudStoreState<TListItem, TDetail, TCreate, TUpdate>>((set, get) => ({
    items: [],
    selectedItem: null,
    loading: false,
    error: null,
    ...createPaginatedState(),

    fetchItems: async (page = 1, search = "") => {
      await withLoading(set, async () => {
        const params = new URLSearchParams({
          page: String(page),
          page_size: String(DEFAULT_PAGE_SIZE),
        });
        if (search) params.set("search", search);
        const data = await api.get<PaginatedResponse<TListItem>>(`${basePath}?${params}`);
        set({
          items: data.items,
          total: data.total,
          page: data.page,
          totalPages: data.total_pages,
        });
      }, `Failed to fetch ${entityName}s`);
    },

    fetchItem: async (id) => {
      await withLoading(set, async () => {
        const item = await api.get<TDetail>(`${basePath}/${id}`);
        set({ selectedItem: item });
      }, `Failed to fetch ${entityName}`);
    },

    createItem: async (data) => {
      return withErrorRethrow(set, async () => {
        const item = await api.post<TDetail>(basePath, data);
        get().fetchItems(get().page);
        return item;
      }, `Failed to create ${entityName}`);
    },

    updateItem: async (id, data) => {
      await withErrorRethrow(set, async () => {
        const item = await api.patch<TDetail>(`${basePath}/${id}`, data);
        set({ selectedItem: item });
        get().fetchItems(get().page);
      }, `Failed to update ${entityName}`);
    },

    deleteItem: async (id) => {
      await withError(set, async () => {
        await api.delete(`${basePath}/${id}`);
        get().fetchItems(get().page);
      }, `Failed to delete ${entityName}`);
    },

    duplicateItem: async (id, name) => {
      await withError(set, async () => {
        await api.post(`${basePath}/${id}/duplicate`, name ? { name } : {});
        get().fetchItems(get().page);
      }, `Failed to duplicate ${entityName}`);
    },

    clearError: () => set({ error: null }),
  }));
}
