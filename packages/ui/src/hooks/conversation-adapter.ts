import type { Conversation, ConversationDetail, ConversationCreate } from "@modularmind/api-client";

// ─── ConversationAdapter ────────────────────────────────────────────────────
// Abstracts conversation CRUD so useConversations works identically in:
//   - apps/chat  (direct Engine API via @modularmind/api-client)
//   - platform   (Next.js proxy routes via fetch)

export interface ConversationAdapter {
  /** List conversations (paginated). */
  listConversations(pageSize: number): Promise<{ items: Conversation[] }>;

  /** Load a single conversation with its messages. */
  getConversation(id: string): Promise<ConversationDetail>;

  /** Create a new conversation. */
  createConversation(body: ConversationCreate): Promise<Conversation>;

  /** Delete a conversation. */
  deleteConversation(id: string): Promise<void>;

  /** Patch a conversation (title, config, supervisor_mode, etc.). */
  patchConversation(id: string, body: Record<string, unknown>): Promise<void>;

  /** Compact conversation history (summarize + prune old messages). */
  compactConversation(id: string): Promise<{ summary_preview: string; compacted_count: number; duration_ms: number }>;
}
