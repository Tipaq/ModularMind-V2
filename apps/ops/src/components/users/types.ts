import type { Role } from "../../stores/auth";

export interface UserStats {
  id: string;
  email: string;
  role: Role;
  is_active: boolean;
  source: string;
  conversation_count: number;
  total_tokens_prompt: number;
  total_tokens_completion: number;
  execution_count: number;
  estimated_cost_usd: number | null;
  last_active_at: string | null;
  created_at: string;
}

export interface UserStatsListResponse {
  items: UserStats[];
  total: number;
  page: number;
  page_size: number;
}

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

export interface AdminConversationListResponse {
  items: AdminConversation[];
  total: number;
  page: number;
  page_size: number;
}

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

export interface MemoryEntry {
  id: string;
  scope: string;
  scope_id: string;
  tier: string;
  content: string;
  importance: number;
  access_count: number;
  last_accessed: string | null;
  created_at: string;
}

export interface MemoryListResponse {
  items: MemoryEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface UserCollection {
  id: string;
  name: string;
  scope: string;
  owner_user_id: string | null;
  allowed_groups: string[];
  chunk_count: number;
  created_at: string;
}
