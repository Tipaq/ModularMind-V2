export interface RAGCollection {
  id: string;
  name: string;
  description?: string;
  document_count: number;
  scope: "GLOBAL" | "PROJECT" | "AGENT";
  created_at: string;
}

export interface RAGDocument {
  id: string;
  collection_id: string;
  filename: string;
  status: "processing" | "ready" | "error";
  chunk_count: number;
  created_at: string;
}

export interface RAGSearchResult {
  chunk_id: string;
  content: string;
  score: number;
  document_id: string;
  metadata: Record<string, unknown>;
}
