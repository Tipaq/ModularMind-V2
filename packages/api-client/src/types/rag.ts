export type RAGScope = "global" | "group" | "agent";

export interface Collection {
  id: string;
  name: string;
  description: string;
  document_count: number;
  chunk_count: number;
  chunk_size: number;
  chunk_overlap: number;
  last_sync: string | null;
  created_at: string | null;
  scope: RAGScope;
  allowed_groups: string[];
  owner_user_id: string | null;
  metadata: Record<string, unknown> | null;
}

export interface CollectionCreate {
  name: string;
  description?: string;
  scope?: RAGScope;
  allowed_groups?: string[];
  owner_user_id?: string | null;
}

export interface CollectionUpdate {
  name?: string;
  description?: string | null;
}

import type { PaginatedResponse } from './common';
export type CollectionListResponse = PaginatedResponse<Collection>;

export interface KnowledgeDocument {
  id: string;
  collection_id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  chunk_count: number;
  status: "pending" | "processing" | "ready" | "failed";
  error_message: string | null;
  created_at: string;
}

export type DocumentListResponse = PaginatedResponse<KnowledgeDocument>;

export interface RAGSearchRequest {
  query: string;
  collection_ids?: string[] | null;
  limit?: number;
  threshold?: number;
}

export interface RAGSearchResultItem {
  chunk: {
    id: string;
    document_id: string;
    collection_id: string;
    content: string;
    chunk_index: number;
  };
  score: number;
  document_filename: string | null;
}

export interface RAGSearchResponse {
  results: RAGSearchResultItem[];
  total: number;
  search_mode: string;
  reranked: boolean;
  warning: string | null;
}
