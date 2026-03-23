import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { EmptyState, relativeTime } from "@modularmind/ui";
import type { Conversation, ProjectDetail } from "@modularmind/api-client";
import { api } from "../../lib/api";

interface ProjectContext {
  project: ProjectDetail;
}

export function ProjectConversations() {
  const { project } = useOutletContext<ProjectContext>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/50" />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <EmptyState
          icon={MessageSquare}
          title="No conversations in this project"
          description="Assign conversations to this project from the chat view."
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="rounded-xl border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Created</th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((conv) => (
              <tr key={conv.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium truncate max-w-[300px]">
                  {conv.title || "Untitled"}
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                  {relativeTime(conv.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ProjectConversations;
