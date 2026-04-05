import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { BookOpen, FileText, MessageSquare, Plus, Settings2, Upload } from "lucide-react";
import { Button, NewConversationButton, relativeTime } from "@modularmind/ui";
import type { Conversation, ProjectDetail, ProjectResourceCounts } from "@modularmind/api-client";
import { api, conversationAdapter } from "@modularmind/api-client";
import { useRecentConversationsStore } from "../../stores/recent-conversations-store";

interface ProjectContext {
  project: ProjectDetail;
  resourceCounts: ProjectResourceCounts | null;
  reload: () => void;
}

export function ProjectOverview() {
  const { project, resourceCounts, reload } = useOutletContext<ProjectContext>();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const addConversation = useRecentConversationsStore((s) => s.addConversation);

  const counts = resourceCounts ?? {
    conversations: 0, collections: 0, mini_apps: 0, scheduled_tasks: 0, repositories: 0,
  };

  useEffect(() => {
    (async () => {
      setLoadingConversations(true);
      try {
        const data = await api.get<{ items: Conversation[] }>(
          `/conversations?project_id=${project.id}&page_size=10`,
        );
        setConversations(data.items ?? []);
      } catch {
        setConversations([]);
      } finally {
        setLoadingConversations(false);
      }
    })();
  }, [project.id]);

  const handleNewConversation = useCallback(async () => {
    const conversation = await conversationAdapter.createConversation({
      supervisor_mode: true,
      project_id: project.id,
    });
    addConversation(conversation);
    reload();
    navigate(`/projects/${project.id}/conversations/${conversation.id}`);
  }, [project.id, addConversation, reload, navigate]);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-6">
        {/* Left column — Chat + Conversations */}
        <div className="flex-1 min-w-0 space-y-6">
          <NewConversationButton onClick={handleNewConversation} />

          {/* Conversations list */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">Conversations</h2>
              </div>
              {counts.conversations > 0 && (
                <button
                  onClick={() => navigate("conversations")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  View all
                </button>
              )}
            </div>

            {loadingConversations ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/50" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No conversations yet. Start one above.
              </p>
            ) : (
              <div className="rounded-xl border border-border/50 overflow-hidden">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className="flex items-center px-4 py-3 border-b border-border/30 last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/projects/${project.id}/conversations/${conv.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && navigate(`/projects/${project.id}/conversations/${conv.id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{conv.title || "Untitled"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Last message {relativeTime(conv.updated_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column — Project settings */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          <ProjectSection
            title="Knowledge"
            icon={BookOpen}
            count={counts.collections}
            countLabel="collection"
            emptyLabel="Add documents for your agents to reference"
            actionLabel="Manage"
            onAction={() => navigate("knowledge")}
          />

          <ProjectSection
            title="Instructions"
            icon={Settings2}
            emptyLabel="Add instructions to customize agent responses for this project"
            actionLabel="Add"
            onAction={() => navigate("knowledge")}
          />

          <ProjectSection
            title="Files"
            icon={FileText}
            emptyLabel="Upload documents to reference in this project"
            onAction={() => navigate("knowledge")}
          >
            <div
              className="rounded-lg border-2 border-dashed border-border/50 p-4 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => navigate("knowledge")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && navigate("knowledge")}
            >
              <Upload className="mx-auto h-6 w-6 text-muted-foreground/50" />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Add PDF, documents or other texts to reference in this project.
              </p>
            </div>
          </ProjectSection>
        </div>
      </div>
    </div>
  );
}

interface ProjectSectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  countLabel?: string;
  emptyLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
}

function ProjectSection({
  title, icon: Icon, count, countLabel, emptyLabel, actionLabel, onAction, children,
}: ProjectSectionProps) {
  return (
    <div className="rounded-xl border border-border/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        {actionLabel && onAction && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onAction}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {children ? (
        children
      ) : count && count > 0 ? (
        <p className="text-xs text-muted-foreground">
          {count} {countLabel}{count > 1 ? "s" : ""} linked to this project
        </p>
      ) : emptyLabel ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : null}
    </div>
  );
}

export default ProjectOverview;
