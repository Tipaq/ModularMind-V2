import type { ChatAdapter, UploadedAttachment, ConversationAdapter, ChatConfigAdapter, McpServer, SupervisorLayer } from "@modularmind/ui";
import type { SendMessageResponse, MessageAttachment, Conversation, ConversationDetail, EngineAgent, EngineGraph, EngineModel } from "@modularmind/api-client";
import { api } from "./api";

/**
 * ChatAdapter implementation for apps/chat.
 * Talks directly to the Engine API via @modularmind/api-client (base: /api/v1).
 * Auth: HttpOnly cookie with withCredentials on EventSource.
 */
export const chatAdapter: ChatAdapter = {
  async sendMessage(conversationId, body) {
    return api.post<SendMessageResponse>(
      `/conversations/${conversationId}/messages`,
      body,
    );
  },

  async uploadAttachment(conversationId, file) {
    const formData = new FormData();
    formData.append("file", file);
    const result = await api.upload<MessageAttachment>(
      `/conversations/${conversationId}/attachments`,
      formData,
    );
    return result as UploadedAttachment;
  },

  getStreamUrl(executionId) {
    return `/api/v1/executions/${executionId}/stream`;
  },

  eventSourceInit: { withCredentials: true },

  async stopExecution(executionId) {
    await api.post(`/executions/${executionId}/stop`);
  },

  async approveExecution(executionId) {
    await api.post(`/executions/${executionId}/approve`);
  },

  async rejectExecution(executionId) {
    await api.post(`/executions/${executionId}/reject`);
  },

  async deleteMessagesFrom(conversationId, messageId) {
    await api.delete(`/conversations/${conversationId}/messages/${messageId}/after`);
  },
};

/**
 * ConversationAdapter implementation for apps/chat.
 * Direct Engine API calls via @modularmind/api-client.
 */
export const conversationAdapter: ConversationAdapter = {
  async listConversations(pageSize) {
    return api.get<{ items: Conversation[] }>(`/conversations?page_size=${pageSize}`);
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

/**
 * ChatConfigAdapter implementation for apps/chat.
 * Fetches agents, graphs, models, and user preferences directly from Engine API.
 */
export const chatConfigAdapter: ChatConfigAdapter = {
  async fetchConfig() {
    console.log("[chatConfig] fetchConfig called — 6 parallel requests");
    const [agentsRes, graphsRes, modelsRes, prefsRes, layersRes, mcpRes] = await Promise.all([
      api.get<{ items: EngineAgent[] }>("/agents?page=1&page_size=200").catch(() => ({ items: [] as EngineAgent[] })),
      api.get<{ items: EngineGraph[] }>("/graphs?page=1&page_size=200").catch(() => ({ items: [] as EngineGraph[] })),
      api.get<EngineModel[]>("/models").catch(() => [] as EngineModel[]),
      api.get<{ preferences: string | null }>("/auth/me/preferences").catch(() => ({ preferences: null })),
      api.get<{ layers: SupervisorLayer[] }>("/internal/supervisor/layers").catch((err) => {
        console.error("[chatConfig] supervisor layers fetch failed:", err);
        return { layers: [] as SupervisorLayer[] };
      }),
      api.get<McpServer[]>("/internal/mcp/servers").catch((err) => {
        console.error("[chatConfig] MCP servers fetch failed:", err);
        return [] as McpServer[];
      }),
    ]);

    return {
      agents: Array.isArray(agentsRes.items) ? agentsRes.items : [],
      graphs: Array.isArray(graphsRes.items) ? graphsRes.items : [],
      models: Array.isArray(modelsRes) ? modelsRes : [],
      supervisorLayers: (() => { console.log("[chatConfig] layersRes:", layersRes); return Array.isArray(layersRes.layers) ? layersRes.layers : []; })(),
      mcpServers: (() => { console.log("[chatConfig] mcpRes:", mcpRes); return Array.isArray(mcpRes) ? mcpRes : []; })(),
      userPreferences: prefsRes.preferences ?? null,
    };
  },

  async updateSupervisorLayer(key, content) {
    try {
      await api.patch(`/internal/supervisor/layers/${key}`, { content });
      return true;
    } catch {
      return false;
    }
  },

  async savePreferences(prefs) {
    await api.patch("/auth/me/preferences", { preferences: prefs });
  },
};
