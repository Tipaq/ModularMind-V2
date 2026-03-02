import { create } from "zustand";
import type { Collection, KnowledgeDocument, RAGScope } from "@modularmind/api-client";
import { api } from "../lib/api";

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

  // Actions
  fetchCollections: () => Promise<void>;
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
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  collections: [],
  collectionsLoading: false,
  collectionsError: null,

  selectedCollectionId: null,
  documents: [],
  documentsLoading: false,
  uploading: false,

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
    } catch {
      // non-fatal
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
    } catch {
      // non-fatal
    }
  },

  clearError: () => set({ collectionsError: null }),
}));
