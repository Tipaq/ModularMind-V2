import { create } from "zustand";
import type { Collection, KnowledgeDocument, RAGScope } from "@modularmind/api-client";
import { api } from "@modularmind/api-client";

// ── Admin types ──

export interface KnowledgeGlobalStats {
  total_collections: number;
  total_documents: number;
  total_chunks: number;
  total_accesses: number;
  documents_by_status: Record<string, number>;
  collections_by_scope: Record<string, number>;
}

export interface ExplorerChunk {
  id: string;
  content: string;
  chunk_index: number;
  collection_id: string;
  collection_name: string;
  document_id: string;
  document_filename: string;
  access_count: number;
  last_accessed: string | null;
  created_at: string;
}

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  node_type: "collection" | "document";
  scope?: string;
  status?: string;
  chunk_count: number;
  size: number;
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

interface KnowledgeState {
  // Collections
  collections: Collection[];
  collectionsLoading: boolean;
  collectionsError: string | null;

  // Selected collection + its documents
  selectedCollectionId: string | null;
  documents: KnowledgeDocument[];
  documentsLoading: boolean;

  // Upload state
  uploading: boolean;

  // Admin: global stats
  globalStats: KnowledgeGlobalStats | null;
  statsLoading: boolean;
  statsError: string | null;

  // Admin: explorer
  explorerChunks: ExplorerChunk[];
  explorerTotal: number;
  explorerPage: number;
  explorerLoading: boolean;
  explorerFilters: { collection_id: string; document_id: string };

  // Admin: graph
  graphData: KnowledgeGraphData | null;
  graphLoading: boolean;
  graphError: string | null;

  // Single collection (detail page)
  selectedCollection: Collection | null;
  selectedCollectionLoading: boolean;
  selectedCollectionError: string | null;

  // Actions
  fetchCollections: () => Promise<void>;
  fetchCollection: (id: string) => Promise<void>;
  createCollection: (data: {
    name: string;
    description?: string;
    scope: RAGScope;
    allowed_groups?: string[];
    owner_user_id?: string | null;
    chunk_size?: number;
    chunk_overlap?: number;
  }) => Promise<Collection | null>;
  deleteCollection: (id: string) => Promise<void>;
  selectCollection: (id: string | null) => void;
  fetchDocuments: (collectionId: string) => Promise<void>;
  uploadDocument: (collectionId: string, file: File) => Promise<void>;
  deleteDocument: (docId: string, collectionId: string) => Promise<void>;
  refreshDocument: (docId: string) => Promise<void>;
  clearError: () => void;

  // Admin actions
  fetchGlobalStats: () => Promise<void>;
  fetchExplorerChunks: (page?: number) => Promise<void>;
  setExplorerFilters: (f: Partial<{ collection_id: string; document_id: string }>) => void;
  fetchGraphData: () => Promise<void>;
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  collections: [],
  collectionsLoading: false,
  collectionsError: null,

  selectedCollectionId: null,
  documents: [],
  documentsLoading: false,
  uploading: false,

  globalStats: null,
  statsLoading: false,
  statsError: null,

  explorerChunks: [],
  explorerTotal: 0,
  explorerPage: 1,
  explorerLoading: false,
  explorerFilters: { collection_id: "", document_id: "" },

  selectedCollection: null,
  selectedCollectionLoading: false,
  selectedCollectionError: null,

  graphData: null,
  graphLoading: false,
  graphError: null,

  fetchCollections: async () => {
    set({ collectionsLoading: true, collectionsError: null });
    try {
      const data = await api.get<{ items: Collection[]; total: number }>(
        "/rag/collections?page_size=200",
      );
      set({ collections: data.items });
    } catch (err) {
      set({ collectionsError: err instanceof Error ? err.message : "Failed to fetch collections" });
    } finally {
      set({ collectionsLoading: false });
    }
  },

  fetchCollection: async (id) => {
    set({ selectedCollectionLoading: true, selectedCollectionError: null });
    try {
      const collection = await api.get<Collection>(`/rag/collections/${id}`);
      set({ selectedCollection: collection });
    } catch (err) {
      set({
        selectedCollectionError: err instanceof Error ? err.message : "Failed to fetch collection",
      });
    } finally {
      set({ selectedCollectionLoading: false });
    }
  },

  createCollection: async (data) => {
    try {
      const created = await api.post<Collection>("/rag/collections", data);
      set((state) => ({ collections: [...state.collections, created] }));
      return created;
    } catch (err) {
      set({ collectionsError: err instanceof Error ? err.message : "Failed to create collection" });
      return null;
    }
  },

  deleteCollection: async (id) => {
    try {
      await api.delete(`/rag/collections/${id}`);
      set((state) => ({
        collections: state.collections.filter((c) => c.id !== id),
        selectedCollectionId: state.selectedCollectionId === id ? null : state.selectedCollectionId,
        documents: state.selectedCollectionId === id ? [] : state.documents,
      }));
    } catch (err) {
      set({ collectionsError: err instanceof Error ? err.message : "Failed to delete collection" });
    }
  },

  selectCollection: (id) => {
    set({ selectedCollectionId: id, documents: [] });
    if (id) get().fetchDocuments(id);
  },

  fetchDocuments: async (collectionId) => {
    set({ documentsLoading: true });
    try {
      const data = await api.get<{ items: KnowledgeDocument[] }>(
        `/rag/collections/${collectionId}/documents?page_size=200`,
      );
      set({ documents: data.items });
    } catch (err) {
      console.warn("[knowledge] Failed to fetch documents:", err);
    } finally {
      set({ documentsLoading: false });
    }
  },

  uploadDocument: async (collectionId, file) => {
    set({ uploading: true, collectionsError: null });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/v1/rag/collections/${collectionId}/documents/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(err.detail ?? "Upload failed");
      }
      // Refresh documents + collection (for updated counts)
      await get().fetchDocuments(collectionId);
      await get().fetchCollections();
    } catch (err) {
      set({ collectionsError: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      set({ uploading: false });
    }
  },

  deleteDocument: async (docId, collectionId) => {
    try {
      await api.delete(`/rag/documents/${docId}`);
      set((state) => ({ documents: state.documents.filter((d) => d.id !== docId) }));
      // Refresh collection counts
      const updated = await api.get<Collection>(`/rag/collections/${collectionId}`);
      set((state) => ({
        collections: state.collections.map((c) => (c.id === collectionId ? updated : c)),
      }));
    } catch (err) {
      set({ collectionsError: err instanceof Error ? err.message : "Failed to delete document" });
    }
  },

  refreshDocument: async (docId) => {
    try {
      const doc = await api.get<KnowledgeDocument>(`/rag/documents/${docId}`);
      set((state) => ({
        documents: state.documents.map((d) => (d.id === docId ? doc : d)),
      }));
    } catch (err) {
      console.warn("[knowledge] Failed to refresh document:", err);
    }
  },

  clearError: () => set({ collectionsError: null }),

  // ── Admin actions ──

  fetchGlobalStats: async () => {
    set({ statsLoading: true, statsError: null });
    try {
      const data = await api.get<KnowledgeGlobalStats>("/rag/admin/stats/global");
      set({ globalStats: data });
    } catch (err) {
      set({ statsError: err instanceof Error ? err.message : "Failed to fetch stats" });
    } finally {
      set({ statsLoading: false });
    }
  },

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

  fetchGraphData: async () => {
    set({ graphLoading: true, graphError: null });
    try {
      const data = await api.get<KnowledgeGraphData>("/rag/admin/graph?limit=200");
      set({ graphData: data });
    } catch (err) {
      set({ graphError: err instanceof Error ? err.message : "Failed to fetch graph" });
    } finally {
      set({ graphLoading: false });
    }
  },
}));
