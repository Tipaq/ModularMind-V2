import type { SendMessageResponse, MessageAttachment } from "@modularmind/api-client";

// ─── ChatAdapter ────────────────────────────────────────────────────────────
// Abstracts the transport layer so useChat can work identically in:
//   - apps/chat  (direct Engine API via @modularmind/api-client)
//   - platform   (Next.js proxy routes via fetch)
//
// Each consumer provides its own implementation matching its auth/routing model.

/** Minimal attachment metadata returned after upload. */
export type UploadedAttachment = Pick<
  MessageAttachment,
  "id" | "filename" | "content_type" | "size_bytes"
>;

export interface ChatAdapter {
  // ── Messages & Streaming ───────────────────────────────────────────────

  /** POST a user message and receive routing/execution info. */
  sendMessage(
    conversationId: string,
    body: { content: string; attachment_ids?: string[] },
  ): Promise<SendMessageResponse>;

  /** Upload a file attachment before sending. */
  uploadAttachment(
    conversationId: string,
    file: File,
  ): Promise<UploadedAttachment>;

  /** Build the SSE stream URL for a given execution. */
  getStreamUrl(executionId: string): string;

  /** Options forwarded to `new EventSource(url, init)`.
   *  apps/chat needs `{ withCredentials: true }` for cookie auth;
   *  platform can omit it (same-origin proxy). */
  eventSourceInit?: EventSourceInit;

  // ── Execution control ──────────────────────────────────────────────────

  /** Cancel a running execution. */
  stopExecution(executionId: string): Promise<void>;

  /** Approve a human-in-the-loop gate. */
  approveExecution(executionId: string): Promise<void>;

  /** Reject a human-in-the-loop gate. */
  rejectExecution(executionId: string): Promise<void>;

  /** Delete a message and all messages after it in a conversation. */
  deleteMessagesFrom(conversationId: string, messageId: string): Promise<void>;
}
