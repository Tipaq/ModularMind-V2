import type { PaginatedResponse } from "./common";

// ─── Core ────────────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  title: string | null;
  agent_id: string | null;
  user_email: string | null;
  is_active: boolean;
  supervisor_mode: boolean;
  config: ConversationConfig;
  message_count: number;
  created_at: string;
  updated_at: string;
}

/** Structurally identical to `AttachmentChipData` in `@modularmind/ui`. */
export interface MessageAttachment {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  metadata: Record<string, unknown>;
  attachments?: MessageAttachment[];
  created_at: string;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
}

export type ConversationListResponse = PaginatedResponse<Conversation>;

/** Typed shape of Conversation.config. */
export interface ConversationConfig {
  model_id?: string | null;
  model_override?: boolean;
  enabled_agent_ids?: string[];
  enabled_graph_ids?: string[];
}

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
  attachment_ids?: string[];
}

// ─── Send Message Response ───────────────────────────────────────────────────

/** Slim memory entry returned in supervisor routing context. */
export interface MemoryEntrySummary {
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
  ephemeral_agent: { id: string; name: string } | null;
  memory_entries: MemoryEntrySummary[];
  knowledge_data: KnowledgeDataResponse | null;
  context_data?: {
    history?: {
      budget?: { included_count: number; total_chars: number; max_chars: number; budget_exceeded: boolean; context_window?: number; history_budget_pct?: number; history_budget_tokens?: number };
      messages?: { role: string; content: string }[];
      summary?: string;
    };
    memory_entries?: MemoryEntrySummary[];
    budget_overview?: {
      context_window: number;
      effective_context: number;
      max_pct: number;
      layers: {
        history: { pct: number; allocated: number; used: number };
        memory: { pct: number; allocated: number; used: number };
        rag: { pct: number; allocated: number; used: number };
        system?: { pct: number; allocated: number; used: number };
      };
    };
  };
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
