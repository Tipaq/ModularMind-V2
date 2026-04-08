import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { BookOpen, MessageSquare, Plus, Settings2, Upload } from "lucide-react";
import {
  Button, ChatInput, relativeTime, useChatConfig, toggleArrayItem, formatModelName,
} from "@modularmind/ui";
import type { AttachedFile } from "@modularmind/ui";
import type { Conversation, EngineModel, ProjectDetail, ProjectResourceCounts } from "@modularmind/api-client";
import { api, conversationAdapter } from "@modularmind/api-client";
import { useRecentConversationsStore } from "../../stores/recent-conversations-store";
import { useKnowledgeHub } from "../../hooks/useKnowledgeHub";
import { chatConfigAdapter } from "../../lib/chat-adapter";

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

  const [inputValue, setInputValue] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [enabledAgentIds, setEnabledAgentIds] = useState<string[]>([]);
  const [enabledGraphIds, setEnabledGraphIds] = useState<string[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const { agents, graphs, models } = useChatConfig(chatConfigAdapter);

  const chatModels = useMemo(
    () => models.filter((m) => m.is_active && m.is_available && !m.is_embedding),
    [models],
  );

  const effectiveModelId = useMemo(() => {
    if (selectedModelId) return selectedModelId;
    if (chatModels.length > 0) return `${chatModels[0].provider}:${chatModels[0].model_id}`;
    return null;
  }, [selectedModelId, chatModels]);

  const modelLabel = useCallback(
    (m: EngineModel) => formatModelName(m.model_id || m.name), [],
  );

  const handleToggleAgent = useCallback(
    (agentId: string) => setEnabledAgentIds((prev) => toggleArrayItem(prev, agentId)), [],
  );
  const handleToggleGraph = useCallback(
    (graphId: string) => setEnabledGraphIds((prev) => toggleArrayItem(prev, graphId)), [],
  );

  const counts = resourceCounts ?? {
    conversations: 0, collections: 0, mini_apps: 0, scheduled_tasks: 0, repositories: 0,
  };

  useEffect(() => {
    (async () => {
      setLoadingConversations(true);
      try {
        const data = await api.get<{ items: Conversation[] }>(
          `/conversations?project_id=${project.id}&page_size=20`,
        );
        setConversations(data.items ?? []);
      } catch {
        setConversations([]);
      } finally {
        setLoadingConversations(false);
      }
    })();
  }, [project.id]);

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() && attachedFiles.length === 0) return;
    const conversation = await conversationAdapter.createConversation({
      supervisor_mode: true,
      project_id: project.id,
    });
    if (effectiveModelId || enabledAgentIds.length > 0 || enabledGraphIds.length > 0) {
      await conversationAdapter.patchConversation(conversation.id, {
        config: {
          enabled_agent_ids: enabledAgentIds,
          enabled_graph_ids: enabledGraphIds,
          model_id: effectiveModelId,
        },
      }).catch((err: unknown) => console.error("[ProjectOverview]", err));
    }
    addConversation(conversation);
    reload();
    navigate(`/projects/${project.id}/conversations/${conversation.id}`, {
      state: { initialMessage: inputValue.trim() },
    });
    setInputValue("");
    setAttachedFiles([]);
  }, [inputValue, attachedFiles, project.id, effectiveModelId, enabledAgentIds, enabledGraphIds, addConversation, reload, navigate]);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-6">
        {/* Left column — Chat + Conversations */}
        <div className="flex-1 min-w-0 space-y-6">
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            isStreaming={false}
            onCancel={() => {}}
            agents={agents}
            graphs={graphs}
            enabledAgentIds={enabledAgentIds}
            enabledGraphIds={enabledGraphIds}
            onToggleAgent={handleToggleAgent}
            onToggleGraph={handleToggleGraph}
            onFilesChange={setAttachedFiles}
            disabledReason={effectiveModelId ? null : "Select a model before sending"}
            models={chatModels}
            selectedModelId={effectiveModelId}
            onModelChange={setSelectedModelId}
            modelLabel={modelLabel}
          />

          {/* Conversations list */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">Conversations</h2>
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
              <>
                <div className="rounded-xl border border-border/50 overflow-hidden max-h-[400px] overflow-y-auto">
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
                {counts.conversations > conversations.length && (
                  <button
                    onClick={() => navigate("conversations")}
                    className="w-full mt-2 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
                  >
                    View all conversations
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right column — Project settings */}
        <RightColumn
          counts={counts}
          projectId={project.id}
          onNavigate={navigate}
        />
      </div>
    </div>
  );
}

interface RightColumnProps {
  counts: ProjectResourceCounts;
  projectId: string;
  onNavigate: (path: string) => void;
}

function RightColumn({ counts, projectId, onNavigate }: RightColumnProps) {
  const { totalDocuments, uploading, handleUpload } = useKnowledgeHub({ projectId });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFilesSelected = useCallback(
    (files: FileList | null) => { if (files) handleUpload(files); },
    [handleUpload],
  );

  const knowledgeSummaryParts: string[] = [];
  if (totalDocuments > 0) knowledgeSummaryParts.push(`${totalDocuments} document${totalDocuments > 1 ? "s" : ""}`);
  if (counts.repositories > 0) knowledgeSummaryParts.push(`${counts.repositories} repo${counts.repositories > 1 ? "s" : ""}`);

  return (
    <div className="w-full lg:w-80 shrink-0 space-y-4">
      <div className="rounded-xl border border-border/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Knowledge</h3>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate("knowledge")}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {knowledgeSummaryParts.length > 0 ? (
          <p className="text-xs text-muted-foreground mb-3">
            {knowledgeSummaryParts.join(", ")} linked to this project
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mb-3">
            Add documents and code repos for your agents to reference
          </p>
        )}

        <div
          className="rounded-lg border-2 border-dashed border-border/50 p-4 text-center hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
        >
          <Upload className="mx-auto h-6 w-6 text-muted-foreground/50" />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {uploading ? "Uploading..." : "Add PDF, documents or other texts"}
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onFilesSelected(e.target.files)}
        />
      </div>

      <div className="rounded-xl border border-border/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Instructions</h3>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate("knowledge")}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Add instructions to customize agent responses for this project
        </p>
      </div>
    </div>
  );
}

export default ProjectOverview;
