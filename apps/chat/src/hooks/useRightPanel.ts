import { useCallback, useState } from "react";

// ─── Supervisor ──────────────────────────────────────────────────────────────

export interface SupervisorData {
  routingStrategy: string | null;
  delegatedTo: string | null;
  isEphemeral: boolean;
  ephemeralAgent: { id: string; name: string } | null;
}

// ─── Knowledge ───────────────────────────────────────────────────────────────

export interface KnowledgeCollection {
  collectionId: string;
  collectionName: string;
  chunkCount: number;
}

export interface KnowledgeChunk {
  chunkId: string;
  documentId: string;
  collectionId: string;
  collectionName: string;
  documentFilename: string | null;
  contentPreview: string;
  score: number;
  chunkIndex: number;
}

export interface KnowledgeData {
  status: "idle" | "loading" | "completed";
  collections: KnowledgeCollection[];
  chunks: KnowledgeChunk[];
  totalResults: number;
}

// ─── Memory ──────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  content: string;
  scope: string;
  tier: string;
  importance: number;
  memoryType: string;
  category: string;
}

// ─── Panel State ─────────────────────────────────────────────────────────────

export interface RightPanelState {
  supervisor: SupervisorData | null;
  knowledge: KnowledgeData;
  memory: MemoryEntry[];
}

const INITIAL_KNOWLEDGE: KnowledgeData = {
  status: "idle",
  collections: [],
  chunks: [],
  totalResults: 0,
};

export function useRightPanel() {
  const [state, setState] = useState<RightPanelState>({
    supervisor: null,
    knowledge: INITIAL_KNOWLEDGE,
    memory: [],
  });

  const reset = useCallback(() => {
    setState({
      supervisor: null,
      knowledge: INITIAL_KNOWLEDGE,
      memory: [],
    });
  }, []);

  const setSupervisorData = useCallback((data: SupervisorData) => {
    setState((prev) => ({ ...prev, supervisor: data }));
  }, []);

  const setMemoryEntries = useCallback((entries: MemoryEntry[]) => {
    setState((prev) => ({ ...prev, memory: entries }));
  }, []);

  const setKnowledgeLoading = useCallback(() => {
    setState((prev) => ({
      ...prev,
      knowledge: { ...prev.knowledge, status: "loading" },
    }));
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleTraceEvent = useCallback((data: any) => {
    if (data?.type !== "trace:knowledge") return;

    setState((prev) => ({
      ...prev,
      knowledge: {
        status: "completed",
        collections: (data.collections || []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (c: any) => ({
            collectionId: c.collection_id,
            collectionName: c.collection_name,
            chunkCount: c.chunk_count,
          }),
        ),
        chunks: (data.chunks || []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (ch: any) => ({
            chunkId: ch.chunk_id,
            documentId: ch.document_id,
            collectionId: ch.collection_id,
            collectionName: ch.collection_name,
            documentFilename: ch.document_filename,
            contentPreview: ch.content_preview,
            score: ch.score,
            chunkIndex: ch.chunk_index,
          }),
        ),
        totalResults: data.total_results || 0,
      },
    }));
  }, []);

  return {
    panelState: state,
    resetPanel: reset,
    setSupervisorData,
    setMemoryEntries,
    setKnowledgeLoading,
    handlePanelEvent: handleTraceEvent,
  } as const;
}
