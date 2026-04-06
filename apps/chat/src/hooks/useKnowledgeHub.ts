import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "@modularmind/ui";
import type {
  Collection,
  CollectionListResponse,
  KnowledgeDocument,
  DocumentListResponse,
} from "@modularmind/api-client";
import { api } from "@modularmind/api-client";

export interface KnowledgeDocumentWithSource extends KnowledgeDocument {
  collection_name: string;
}

interface UseKnowledgeHubOptions {
  projectId?: string;
}

export function useKnowledgeHub(options: UseKnowledgeHubOptions = {}) {
  const { projectId } = options;
  const user = useAuthStore((s) => s.user);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocumentWithSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const personalCollectionRef = useRef<Collection | null>(null);

  const loadAll = useCallback(async (cancelled: boolean = false) => {
    setLoading(true);
    try {
      const query = projectId
        ? `/rag/collections?project_id=${projectId}&page_size=200`
        : "/rag/collections?page_size=200";
      const collectionsData = await api.get<CollectionListResponse>(query);
      if (cancelled) return;
      const loadedCollections = collectionsData.items ?? [];
      setCollections(loadedCollections);

      const documentResults = await Promise.all(
        loadedCollections.map(async (col) => {
          try {
            const docs = await api.get<DocumentListResponse>(
              `/rag/collections/${col.id}/documents?page_size=100`,
            );
            return (docs.items ?? []).map((doc) => ({
              ...doc,
              collection_name: col.name,
            }));
          } catch {
            return [];
          }
        }),
      );

      if (cancelled) return;
      const allDocuments = documentResults
        .flat()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setDocuments(allDocuments);
    } catch {
      if (cancelled) return;
      setCollections([]);
      setDocuments([]);
    } finally {
      if (!cancelled) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    loadAll(cancelled);
    return () => { cancelled = true; };
  }, [loadAll]);

  const ensurePersonalCollection = useCallback(async (): Promise<string> => {
    if (personalCollectionRef.current) return personalCollectionRef.current.id;

    const existing = collections.find(
      (c) => c.scope === "agent" && c.owner_user_id === user?.id,
    );
    if (existing) {
      personalCollectionRef.current = existing;
      return existing.id;
    }

    const created = await api.post<Collection>("/rag/collections", {
      name: "My Documents",
      scope: "agent",
      owner_user_id: user?.id ?? null,
    });
    personalCollectionRef.current = created;
    setCollections((prev) => [...prev, created]);
    return created.id;
  }, [collections, user?.id]);

  const handleUpload = useCallback(async (files: FileList) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const collectionId = await ensurePersonalCollection();
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        await api.upload(`/rag/collections/${collectionId}/documents`, formData);
      }
      await loadAll();
    } finally {
      setUploading(false);
    }
  }, [ensurePersonalCollection, loadAll]);

  const handleDelete = useCallback(async (docId: string, collectionId: string) => {
    await api.delete(`/rag/collections/${collectionId}/documents/${docId}`);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return documents;
    const lower = search.toLowerCase();
    return documents.filter((d) => d.filename.toLowerCase().includes(lower));
  }, [documents, search]);

  return {
    documents: filtered,
    totalDocuments: documents.length,
    collections,
    loading,
    uploading,
    search,
    setSearch,
    handleUpload,
    handleDelete,
    reload: loadAll,
  };
}
