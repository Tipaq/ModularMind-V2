import type { SendMessageResponse, MessageAttachment } from "../types/conversations";
import { api } from "../index";

/** Minimal attachment metadata returned after upload. */
export type UploadedAttachment = Pick<
  MessageAttachment,
  "id" | "filename" | "content_type" | "size_bytes"
>;

export interface ChatAdapter {
  sendMessage(
    conversationId: string,
    body: { content: string; attachment_ids?: string[] },
  ): Promise<SendMessageResponse>;

  uploadAttachment(
    conversationId: string,
    file: File,
  ): Promise<UploadedAttachment>;

  getStreamUrl(executionId: string): string;

  eventSourceInit?: EventSourceInit;

  stopExecution(executionId: string): Promise<void>;
  approveExecution(executionId: string): Promise<void>;
  rejectExecution(executionId: string): Promise<void>;
  respondToPrompt(executionId: string, promptId: string, response: string): Promise<void>;
  deleteMessagesFrom(conversationId: string, messageId: string): Promise<void>;
}

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

  async respondToPrompt(executionId, promptId, response) {
    await api.post(`/executions/${executionId}/respond`, { prompt_id: promptId, response });
  },

  async deleteMessagesFrom(conversationId, messageId) {
    await api.delete(
      `/conversations/${conversationId}/messages/${messageId}/after`,
    );
  },
};
