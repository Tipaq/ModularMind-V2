import type { KnowledgeCollection, KnowledgeChunk, KnowledgeData } from "../types/chat";

/** Raw snake_case collection from API response. */
interface RawCollection {
  collection_id: string;
  collection_name: string;
  chunk_count: number;
}

/** Raw snake_case chunk from API response. */
interface RawChunk {
  chunk_id: string;
  document_id: string;
  collection_id: string;
  collection_name: string;
  document_filename?: string | null;
  content_preview: string;
  score: number;
  chunk_index: number;
}

/** Raw snake_case knowledge response from API. */
export interface RawKnowledgeData {
  collections?: RawCollection[];
  chunks?: RawChunk[];
  total_results?: number;
}

/** Map a single snake_case API collection to a camelCase KnowledgeCollection. */
function mapCollection(c: RawCollection): KnowledgeCollection {
  return {
    collectionId: c.collection_id,
    collectionName: c.collection_name,
    chunkCount: c.chunk_count,
  };
}

/** Map a single snake_case API chunk to a camelCase KnowledgeChunk. */
function mapChunk(ch: RawChunk): KnowledgeChunk {
  return {
    chunkId: ch.chunk_id,
    documentId: ch.document_id,
    collectionId: ch.collection_id,
    collectionName: ch.collection_name,
    documentFilename: ch.document_filename ?? null,
    contentPreview: ch.content_preview,
    score: ch.score,
    chunkIndex: ch.chunk_index,
  };
}

/** Map snake_case API knowledge response to camelCase UI types. */
export function mapKnowledgeData(raw: RawKnowledgeData): KnowledgeData {
  return {
    collections: (raw.collections || []).map(mapCollection),
    chunks: (raw.chunks || []).map(mapChunk),
    totalResults: raw.total_results || 0,
  };
}

