import type { PaginatedResponse } from "./common";

// ─── Core ────────────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  title: string | null;
  agent_id: string | null;
  user_email: string | null;
  is_active: boolean;
  supervisor_mode: boolean;
  config: Record<string, unknown>;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
}

export type ConversationListResponse = PaginatedResponse<Conversation>;

// ─── Requests ────────────────────────────────────────────────────────────────

export interface ConversationCreate {
  agent_id?: string | null;
  title?: string | null;
  supervisor_mode?: boolean;
  config?: Record<string, unknown> | null;
}

export interface ConversationUpdate {
  title?: string | null;
  supervisor_mode?: boolean | null;
  config?: Record<string, unknown> | null;
}

export interface SendMessageRequest {
  content: string;
}

// ─── Send Message Response ───────────────────────────────────────────────────

export interface MemoryEntryResponse {
  id: string;
  content: string;
  scope: string;
  tier: string;
  importance: number;
  memory_type: string;
  category: string;
}

export interface KnowledgeChunkResponse {
  chunk_id: string;
  document_id: string;
  collection_id: string;
  collection_name: string;
  document_filename: string | null;
  content_preview: string;
  score: number;
  chunk_index: number;
}

export interface KnowledgeCollectionResponse {
  collection_id: string;
  collection_name: string;
  chunk_count: number;
}

export interface KnowledgeDataResponse {
  collections: KnowledgeCollectionResponse[];
  chunks: KnowledgeChunkResponse[];
  total_results: number;
}

export interface SendMessageResponse {
  user_message: Message;
  execution_id: string | null;
  message_id: string | null;
  stream_url: string | null;
  direct_response: string | null;
  routing_strategy: string | null;
  delegated_to: string | null;
  is_ephemeral: boolean | null;
  ephemeral_agent: Record<string, unknown> | null;
  memory_entries: MemoryEntryResponse[];
  knowledge_data: KnowledgeDataResponse | null;
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface ConversationSearchRequest {
  query: string;
  agent_id?: string | null;
  limit?: number;
  threshold?: number;
  include_group?: boolean;
}

export interface ConversationSearchResultItem {
  conversation_id: string;
  conversation_title: string | null;
  message_content: string;
  score: number;
  timestamp: string | null;
  agent_id: string | null;
}

export interface ConversationSearchResponse {
  results: ConversationSearchResultItem[];
  total: number;
}
