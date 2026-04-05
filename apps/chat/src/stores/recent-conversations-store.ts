import { create } from "zustand";
import type { Conversation } from "@modularmind/api-client";
import { conversationAdapter } from "@modularmind/api-client";

const PAGE_SIZE = 20;

interface RecentConversationsState {
  conversations: Conversation[];
  loaded: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  addConversation: (conv: Conversation) => void;
  removeConversation: (id: string) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
}

export const useRecentConversationsStore = create<RecentConversationsState>()(
  (set, get) => ({
    conversations: [],
    loaded: false,

    load: async () => {
      if (get().loaded) return;
      try {
        const data = await conversationAdapter.listConversations(PAGE_SIZE);
        set({ conversations: data.items ?? [], loaded: true });
      } catch {
        set({ loaded: true });
      }
    },

    refresh: async () => {
      try {
        const data = await conversationAdapter.listConversations(PAGE_SIZE);
        set({ conversations: data.items ?? [], loaded: true });
      } catch {
        /* keep existing data */
      }
    },

    addConversation: (conv) =>
      set((state) => ({
        conversations: [conv, ...state.conversations.filter((c) => c.id !== conv.id)],
      })),

    removeConversation: (id) =>
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== id),
      })),

    updateConversation: (id, updates) =>
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === id ? { ...c, ...updates } : c,
        ),
      })),
  }),
);
