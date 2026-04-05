import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConversationList, useAuthStore } from "@modularmind/ui";
import type { Conversation } from "@modularmind/api-client";
import { conversationAdapter } from "@modularmind/api-client";
import { useRecentConversationsStore } from "../stores/recent-conversations-store";

const PAGE_SIZE = 50;

export function ConversationsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { addConversation, removeConversation, updateConversation } =
    useRecentConversationsStore();

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await conversationAdapter.listConversations(PAGE_SIZE);
      setConversations(data.items ?? []);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadConversations();
  }, [user, loadConversations]);

  const handleCreate = useCallback(async () => {
    const conversation = await conversationAdapter.createConversation({
      supervisor_mode: true,
    });
    addConversation(conversation);
    navigate(`/chat/${conversation.id}`);
  }, [navigate, addConversation]);

  const handleSelect = useCallback(
    (id: string) => navigate(`/chat/${id}`),
    [navigate],
  );

  const handleDelete = useCallback(async (id: string) => {
    await conversationAdapter.deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    removeConversation(id);
  }, [removeConversation]);

  const handleRename = useCallback(async (id: string, title: string) => {
    await conversationAdapter.patchConversation(id, { title });
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c)),
    );
    updateConversation(id, { title });
  }, [updateConversation]);

  return (
    <ConversationList
      conversations={conversations}
      loading={loading}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onSelect={handleSelect}
      onCreate={handleCreate}
      onDelete={handleDelete}
      onRename={handleRename}
      subtitle="Your conversations"
    />
  );
}

export default ConversationsPage;
