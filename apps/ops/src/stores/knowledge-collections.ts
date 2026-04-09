import { create } from "zustand";
import type { Collection, KnowledgeDocument, RAGScope } from "@modularmind/api-client";
import { api } from "@modularmind/api-client";
import { handleStoreError } from "./store-helpers";

interface KnowledgeCollectionsState {
  collections: Collection[];
  collectionsLoading: boolean;
  collectionsError: string | null;

  selectedCollectionId: string | null;
  documents: KnowledgeDocument[];
  documentsLoading: boolean;

  uploading: boolean;

  selectedCollection: Collection | null;
  selectedCollectionLoading: boolean;
  selectedCollectionError: string | null;

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
}

export const useKnowledgeCollectionsStore = create<KnowledgeCollectionsState>((set, get) => ({
  collections: [],
  collectionsLoading: false,
  collectionsError: null,

  selectedCollectionId: null,
  documents: [],
  documentsLoading: false,
  uploading: false,

  selectedCollection: null,
  selectedCollectionLoading: false,
  selectedCollectionError: null,

  fetchCollections: async () => {
    set({ collectionsLoading: true, collectionsError: null });
    try {
      const data = await api.get<{ items: Collection[]; total: number }>(
        "/rag/collections?page_size=200",
      );
      set({ collections: data.items });
    } catch (err) {
      set({ collectionsError: handleStoreError(err, "Failed to fetch collections") });
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
        selectedCollectionError: handleStoreError(err, "Failed to fetch collection"),
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
      set({ collectionsError: handleStoreError(err, "Failed to create collection") });
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
      set({ collectionsError: handleStoreError(err, "Failed to delete collection") });
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
      await get().fetchDocuments(collectionId);
      await get().fetchCollections();
    } catch (err) {
      set({ collectionsError: handleStoreError(err, "Upload failed") });
    } finally {
      set({ uploading: false });
    }
  },

  deleteDocument: async (docId, collectionId) => {
    try {
      await api.delete(`/rag/documents/${docId}`);
      set((state) => ({ documents: state.documents.filter((d) => d.id !== docId) }));
      const updated = await api.get<Collection>(`/rag/collections/${collectionId}`);
      set((state) => ({
        collections: state.collections.map((c) => (c.id === collectionId ? updated : c)),
      }));
    } catch (err) {
      set({ collectionsError: handleStoreError(err, "Failed to delete document") });
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
}));
