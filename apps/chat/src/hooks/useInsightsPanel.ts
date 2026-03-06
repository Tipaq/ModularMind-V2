import { useCallback, useState } from "react";
import { mapKeysToCamel } from "@modularmind/api-client";
import type {
  SupervisorData,
  KnowledgeCollection,
  KnowledgeChunk,
  KnowledgeData as KnowledgeDataBase,
  InsightsMemoryEntry,
} from "@modularmind/ui";

export type { SupervisorData, KnowledgeCollection, KnowledgeChunk, InsightsMemoryEntry };

/** Extended KnowledgeData with loading status for the panel. */
export interface KnowledgeData extends KnowledgeDataBase {
  status: "idle" | "loading" | "completed";
}

// ─── Panel State ─────────────────────────────────────────────────────────────

export interface InsightsPanelState {
  supervisor: SupervisorData | null;
  knowledge: KnowledgeData;
  memory: InsightsMemoryEntry[];
}

const INITIAL_KNOWLEDGE: KnowledgeData = {
  status: "idle",
  collections: [],
  chunks: [],
  totalResults: 0,
};

interface KnowledgeTraceEvent {
  type: string;
  collections?: Array<{
    collection_id: string;
    collection_name: string;
    chunk_count: number;
  }>;
  chunks?: Array<{
    chunk_id: string;
    document_id: string;
    collection_id: string;
    collection_name: string;
    document_filename?: string;
    content_preview: string;
    score: number;
    chunk_index: number;
  }>;
  total_results?: number;
}

export function useInsightsPanel() {
  const [state, setState] = useState<InsightsPanelState>({
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

  const setMemoryEntries = useCallback((entries: InsightsMemoryEntry[]) => {
    setState((prev) => ({ ...prev, memory: entries }));
  }, []);

  const setKnowledgeLoading = useCallback(() => {
    setState((prev) => ({
      ...prev,
      knowledge: { ...prev.knowledge, status: "loading" },
    }));
  }, []);

  const handleTraceEvent = useCallback((data: KnowledgeTraceEvent) => {
    if (data?.type !== "trace:knowledge") return;

    setState((prev) => ({
      ...prev,
      knowledge: {
        status: "completed",
        collections: (data.collections || []).map((c) => mapKeysToCamel(c) as unknown as KnowledgeCollection),
        chunks: (data.chunks || []).map((ch) => ({
          ...mapKeysToCamel(ch),
          documentFilename: ch.document_filename ?? null,
        }) as unknown as KnowledgeChunk),
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
