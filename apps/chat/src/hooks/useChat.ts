/**
 * Chat hook — conversation management + message sending.
 */

// TODO: Implement chat state management
// - Conversation CRUD
// - Message sending via POST /api/v1/conversations/:id/messages
// - Streaming via useStreaming
export function useChat() {
  return {
    conversations: [],
    messages: [],
    sendMessage: async (_content: string) => {},
  };
}
