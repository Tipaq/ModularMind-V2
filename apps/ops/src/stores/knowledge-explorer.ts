import { create } from "zustand";
import { api } from "@modularmind/api-client";
import type { ExplorerChunk } from "./knowledge-types";

interface KnowledgeExplorerState {
  explorerChunks: ExplorerChunk[];
  explorerTotal: number;
  explorerPage: number;
  explorerLoading: boolean;
  explorerFilters: { collection_id: string; document_id: string };

  fetchExplorerChunks: (page?: number) => Promise<void>;
  setExplorerFilters: (f: Partial<{ collection_id: string; document_id: string }>) => void;
}

export const useKnowledgeExplorerStore = create<KnowledgeExplorerState>((set, get) => ({
  explorerChunks: [],
  explorerTotal: 0,
  explorerPage: 1,
  explorerLoading: false,
  explorerFilters: { collection_id: "", document_id: "" },

  fetchExplorerChunks: async (page = 1) => {
    set({ explorerLoading: true });
    try {
      const { explorerFilters } = get();
      const params = new URLSearchParams({ page: String(page), page_size: "20" });
      if (explorerFilters.collection_id) params.set("collection_id", explorerFilters.collection_id);
      if (explorerFilters.document_id) params.set("document_id", explorerFilters.document_id);

      const data = await api.get<{ items: ExplorerChunk[]; total: number; page: number }>(
        `/rag/admin/explore?${params}`,
      );
      set({ explorerChunks: data.items, explorerTotal: data.total, explorerPage: data.page });
    } catch (err) {
      console.error("[knowledge] Failed to fetch explorer chunks:", err);
    } finally {
      set({ explorerLoading: false });
    }
  },

  setExplorerFilters: (f) => {
    set((state) => ({
      explorerFilters: { ...state.explorerFilters, ...f },
    }));
  },
}));
