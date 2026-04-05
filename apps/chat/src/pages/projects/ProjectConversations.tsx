import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { ConversationList } from "@modularmind/ui";
import type { Conversation, ProjectDetail } from "@modularmind/api-client";
import { api, conversationAdapter } from "@modularmind/api-client";

interface ProjectContext {
  project: ProjectDetail;
  reload: () => void;
}

export function ProjectConversations() {
  const { project, reload } = useOutletContext<ProjectContext>();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ items: Conversation[] }>(
        `/conversations?project_id=${project.id}&page_size=100`,
      );
      setConversations(data.items ?? []);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const handleCreate = useCallback(async () => {
    const conversation = await conversationAdapter.createConversation({
      supervisor_mode: true,
      project_id: project.id,
    });
    reload();
    navigate(`/projects/${project.id}/conversations/${conversation.id}`);
  }, [project.id, reload, navigate]);

  const handleSelect = useCallback(
    (id: string) => navigate(`/projects/${project.id}/conversations/${id}`),
    [project.id, navigate],
  );

  const handleDelete = useCallback(async (id: string) => {
    await conversationAdapter.deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    reload();
  }, [reload]);

  const handleRename = useCallback(async (id: string, title: string) => {
    await conversationAdapter.patchConversation(id, { title });
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c)),
    );
  }, []);

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
      title="Conversations"
      subtitle="Chat sessions linked to this project."
      emptyTitle="No conversations in this project"
      emptyDescription="Start a new conversation to begin chatting within this project context."
    />
  );
}

export default ProjectConversations;
