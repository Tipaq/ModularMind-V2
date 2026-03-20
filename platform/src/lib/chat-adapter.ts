import type { ChatAdapter, UploadedAttachment, ConversationAdapter, ChatConfigAdapter } from "@modularmind/ui";
import type { EngineAgent, EngineGraph, EngineModel, McpServer, SupervisorLayer } from "@modularmind/ui";
import type { SendMessageResponse, Conversation, ConversationDetail } from "@modularmind/api-client";

/**
 * Helper: POST/GET via Platform proxy routes (/api/chat/...).
 * Auth is handled by NextAuth session cookies (same-origin).
 */
async function proxyFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || err.detail || `Request failed (${res.status})`);
  }
  // Handle 204 No Content
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return res.json();
}

/**
 * ChatAdapter implementation for the Platform (Next.js).
 * All calls go through /api/chat/* proxy routes which forward to the Engine
 * with HMAC auth + X-Platform-User-Email header.
 * No withCredentials needed — same-origin requests.
 */
export const chatAdapter: ChatAdapter = {
  async sendMessage(conversationId, body) {
    return proxyFetch<SendMessageResponse>(
      `/api/chat/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  },

  async uploadAttachment(conversationId, file) {
    const formData = new FormData();
    formData.append("file", file);
    return proxyFetch<UploadedAttachment>(
      `/api/chat/conversations/${conversationId}/attachments`,
      { method: "POST", body: formData },
    );
  },

  getStreamUrl(executionId) {
    return `/api/chat/executions/${executionId}/stream`;
  },

  // No eventSourceInit needed — same-origin proxy, no withCredentials required.

  async stopExecution(executionId) {
    await proxyFetch(`/api/chat/executions/${executionId}`, { method: "POST" });
  },

  async approveExecution(executionId) {
    await proxyFetch(`/api/chat/executions/${executionId}/approve`, { method: "POST" });
  },

  async rejectExecution(executionId) {
    await proxyFetch(`/api/chat/executions/${executionId}/reject`, { method: "POST" });
  },

  async deleteMessagesFrom(conversationId, messageId) {
    await proxyFetch(`/api/chat/conversations/${conversationId}/messages/${messageId}/after`, { method: "DELETE" });
  },
};

/**
 * ConversationAdapter implementation for the Platform.
 * Proxied through /api/chat/* routes.
 */
export const conversationAdapter: ConversationAdapter = {
  async listConversations(pageSize) {
    return proxyFetch<{ items: Conversation[] }>(
      `/api/chat/conversations?page_size=${pageSize}`,
    );
  },

  async getConversation(id) {
    return proxyFetch<ConversationDetail>(`/api/chat/conversations/${id}`);
  },

  async createConversation(body) {
    return proxyFetch<Conversation>("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async deleteConversation(id) {
    await proxyFetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
  },

  async patchConversation(id, body) {
    await proxyFetch(`/api/chat/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async compactConversation(id) {
    return proxyFetch("/api/chat/compact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: id }),
    });
  },
};

/**
 * ChatConfigAdapter implementation for the Platform.
 * Fetches config via proxy routes: /api/chat/config, /api/chat/models, /api/chat/supervisor/layers.
 */
export const chatConfigAdapter: ChatConfigAdapter = {
  async fetchConfig() {
    const [configRes, modelsRes, layersRes] = await Promise.all([
      fetch("/api/chat/config").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/chat/models").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/chat/supervisor/layers").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);

    return {
      agents: Array.isArray(configRes?.agents) ? configRes.agents as EngineAgent[] : [],
      graphs: Array.isArray(configRes?.graphs) ? configRes.graphs as EngineGraph[] : [],
      models: Array.isArray(modelsRes) ? modelsRes as EngineModel[] : [],
      mcpServers: Array.isArray(configRes?.mcpServers) ? configRes.mcpServers as McpServer[] : [],
      supervisorLayers: (layersRes?.layers ?? []) as SupervisorLayer[],
    };
  },

  async updateSupervisorLayer(key, content) {
    try {
      const res = await fetch(`/api/chat/supervisor/layers/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
