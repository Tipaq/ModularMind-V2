export interface Collection {
  id: string;
  name: string;
  description: string | null;
  chunk_size: number;
  chunk_overlap: number;
  document_count: number;
  created_at: string;
  updated_at: string;
}

export interface CollectionCreate {
  name: string;
  description?: string | null;
  chunk_size?: number;
  chunk_overlap?: number;
}

export interface CollectionUpdate {
  name?: string;
  description?: string | null;
  chunk_size?: number;
  chunk_overlap?: number;
}

export interface Document {
  id: string;
  name: string;
  source_type: 'upload' | 'url' | 'text';
  status: 'pending' | 'processing' | 'ready' | 'failed';
  file_type: string | null;
  file_size_bytes: number | null;
  chunk_count: number;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface DocumentListResponse {
  items: Document[];
  total: number;
  page: number;
  page_size: number;
}

export interface RAGSearchRequest {
  query: string;
  collection_ids?: string[] | null;
  limit?: number;
  similarity_threshold?: number;
}

export interface RAGSearchResult {
  chunk_id: string;
  document_id: string;
  document_name: string;
  content: string;
  similarity_score: number;
  metadata: Record<string, unknown>;
}

export interface RAGSearchResponse {
  results: RAGSearchResult[];
  query: string;
  total_found: number;
}
