import type { Conversation, ConversationDetail, ConversationCreate } from "../types/conversations";
import { api } from "../index";

export interface ConversationAdapter {
  listConversations(pageSize: number): Promise<{ items: Conversation[] }>;
  getConversation(id: string): Promise<ConversationDetail>;
  createConversation(body: ConversationCreate): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;
  patchConversation(id: string, body: Record<string, unknown>): Promise<void>;
  compactConversation(id: string): Promise<{
    summary_preview: string;
    compacted_count: number;
    duration_ms: number;
  }>;
}

export const conversationAdapter: ConversationAdapter = {
  async listConversations(pageSize) {
    return api.get<{ items: Conversation[] }>(
      `/conversations?page_size=${pageSize}`,
    );
  },

  async getConversation(id) {
    return api.get<ConversationDetail>(`/conversations/${id}`);
  },

  async createConversation(body) {
    return api.post<Conversation>("/conversations", body);
  },

  async deleteConversation(id) {
    await api.delete(`/conversations/${id}`);
  },

  async patchConversation(id, body) {
    await api.patch(`/conversations/${id}`, body);
  },

  async compactConversation(id) {
    return api.post(`/conversations/${id}/compact`);
  },
};
