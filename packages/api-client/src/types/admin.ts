import type { PaginatedResponse } from "./common";

type Role = "owner" | "admin" | "user";

// ─── User Stats ─────────────────────────────────────────────────────────────

export interface UserStats {
  id: string;
  email: string;
  role: Role;
  is_active: boolean;
  conversation_count: number;
  total_tokens_prompt: number;
  total_tokens_completion: number;
  execution_count: number;
  estimated_cost_usd: number | null;
  last_active_at: string | null;
  created_at: string;
}

export type UserStatsListResponse = PaginatedResponse<UserStats>;

// ─── Admin Conversations ────────────────────────────────────────────────────

export interface AdminConversation {
  id: string;
  agent_id: string | null;
  title: string | null;
  message_count: number;
  tokens_prompt: number;
  tokens_completion: number;
  estimated_cost: number | null;
  created_at: string;
  updated_at: string;
}

export type AdminConversationListResponse = PaginatedResponse<AdminConversation>;

export interface AdminMessage {
  id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown> | null;
  execution_id: string | null;
  created_at: string;
}

export interface AdminConversationMessagesResponse {
  conversation_id: string;
  user_id: string;
  user_email: string;
  messages: AdminMessage[];
}

// ─── Token Usage ────────────────────────────────────────────────────────────

export interface TokenUsageSummary {
  total_prompt: number;
  total_completion: number;
  estimated_cost_usd: number | null;
  execution_count: number;
}

export interface DailyTokenUsage {
  date: string;
  tokens_prompt: number;
  tokens_completion: number;
  estimated_cost_usd: number | null;
  execution_count: number;
}

export interface ModelTokenUsage {
  model: string;
  provider: string | null;
  tokens_prompt: number;
  tokens_completion: number;
  estimated_cost_usd: number | null;
}

export interface TokenUsageResponse {
  summary: TokenUsageSummary;
  daily: DailyTokenUsage[];
  by_model: ModelTokenUsage[];
}

// ─── Admin Collections ──────────────────────────────────────────────────────

export interface UserCollection {
  id: string;
  name: string;
  scope: string;
  owner_user_id: string | null;
  allowed_groups: string[];
  chunk_count: number;
  created_at: string;
}
