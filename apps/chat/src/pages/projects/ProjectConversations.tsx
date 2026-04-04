import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { MessageSquare, Plus } from "lucide-react";
import { Button, EmptyState, relativeTime } from "@modularmind/ui";
import type { Conversation, ProjectDetail } from "@modularmind/api-client";
import { conversationAdapter } from "@modularmind/api-client";
import { api } from "@modularmind/api-client";

interface ProjectContext {
  project: ProjectDetail;
  reload: () => void;
}

export function ProjectConversations() {
  const { project, reload } = useOutletContext<ProjectContext>();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

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

  const handleNewConversation = async () => {
    setCreating(true);
    try {
      const conversation = await conversationAdapter.createConversation({
        supervisor_mode: true,
        project_id: project.id,
      });
      reload();
      navigate(`/chat/${conversation.id}`);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/50" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">Conversations</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Chat sessions linked to this project.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleNewConversation} disabled={creating}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          {creating ? "Creating..." : "New Conversation"}
        </Button>
      </div>

      {conversations.length === 0 && (
        <EmptyState
          icon={MessageSquare}
          title="No conversations in this project"
          description="Start a new conversation to begin chatting within this project context."
        />
      )}

      {conversations.length > 0 && (
        <div className="rounded-xl border border-border/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Messages</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Created</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((conv) => (
                <tr
                  key={conv.id}
                  className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate(`/chat/${conv.id}`)}
                >
                  <td className="px-4 py-3 font-medium truncate max-w-[300px]">
                    {conv.title || "Untitled"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {conv.message_count}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {relativeTime(conv.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ProjectConversations;
