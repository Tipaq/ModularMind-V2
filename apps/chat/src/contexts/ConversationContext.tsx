import { createContext, useContext } from "react";
import type { Conversation } from "@modularmind/api-client";

interface ConversationContextValue {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

export const ConversationProvider = ConversationContext.Provider;

export function useConversationContext(): ConversationContextValue | null {
  return useContext(ConversationContext);
}
