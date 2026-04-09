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
