import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Bot,
  Settings2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Info,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Wrench,
} from "lucide-react";
import {
  Input,
  Label,
  Badge,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  AgentConfigGrid,
  PromptDisplay,
  formatModelName,
  formatDurationMs,
} from "@modularmind/ui";
import type { ExecutionActivity } from "@modularmind/ui";
import type { Agent } from "@modularmind/api-client";
import type { Node } from "@xyflow/react";
import { NODE_CONFIG, type NodeType } from "../nodes/nodeConfig";
import { api } from "../../../lib/api";
import { useAgentsStore } from "../../../stores/agents";
import {
  AgentFormDialog,
  type AgentFormValues,
} from "../../agents/AgentFormDialog";
import { countEnabledCategories } from "../../agents/tool-categories";

interface PropertiesPanelProps {
  node: Node | null;
  onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
  isEditMode?: boolean;
  executionActivities?: ExecutionActivity[];
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

function resolveAgentId(data: Record<string, unknown>): string | null {
  const fromConfig = (data.config as Record<string, unknown> | undefined)
    ?.agentId as string | undefined;
  if (fromConfig) return fromConfig;
  if (data.agent_id) return data.agent_id as string;
  return null;
}

const TOOL_CATEGORY_LABELS: Record<string, string> = {
  knowledge: "Knowledge", filesystem: "Filesystem", shell: "Shell",
  network: "Network", file_storage: "File Storage",
  human_interaction: "Human Interaction", image_generation: "Image Generation",
  custom_tools: "Custom Tools", mini_apps: "Mini Apps", github: "GitHub",
  web: "Web", git: "Git", scheduling: "Scheduling",
};

function isCategoryOn(value: boolean | Record<string, boolean> | undefined): boolean {
  if (value === undefined || value === false) return false;
  if (value === true) return true;
  return Object.values(value).some(Boolean);
}

function AgentToolsSummary({ toolCategories }: { toolCategories: Record<string, boolean | Record<string, boolean>> }) {
  const enabledCategories = Object.entries(toolCategories).filter(([, v]) => isCategoryOn(v));
  const totalCount = Object.keys(TOOL_CATEGORY_LABELS).length;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Wrench className="h-3 w-3" />
          Tools
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {enabledCategories.length} / {totalCount}
        </span>
      </div>
      {enabledCategories.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {enabledCategories.map(([key]) => (
            <Badge key={key} variant="secondary" className="text-[9px] py-0 px-1.5">
              {TOOL_CATEGORY_LABELS[key] || key}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">No tools enabled</p>
      )}
    </div>
  );
}

const TAB_CLS =
  "h-9 flex-1 justify-center rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2.5 gap-1 text-xs";

function findActivityForNode(
  activities: ExecutionActivity[],
  nodeId: string,
): ExecutionActivity | null {
  for (const activity of activities) {
    if (activity.nodeId === nodeId) return activity;
    if (activity.children) {
      const found = findActivityForNode(activity.children, nodeId);
      if (found) return found;
    }
  }
  return null;
}

function agentToFormValues(agent: Agent): AgentFormValues {
  return {
    name: agent.name,
    description: agent.description || "",
    modelId: agent.model_id,
    systemPrompt: agent.system_prompt || "",
    memoryEnabled: agent.memory_enabled,
    timeoutEnabled: agent.timeout_seconds > 0,
    timeoutSeconds: agent.timeout_seconds || 120,
    toolCategories: agent.tool_categories || {},
  };
}

export function PropertiesPanel({
  node,
  onUpdateNode,
  isEditMode = true,
  executionActivities = [],
}: PropertiesPanelProps) {
  const [agentDetail, setAgentDetail] = useState<Agent | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [showEditAgent, setShowEditAgent] = useState(false);
  const { agents, fetchAgents, updateAgent } = useAgentsStore();

  const nodeData = node?.data as Record<string, unknown> | undefined;
  const nodeType = ((nodeData?.type || node?.type || "agent") as string) as NodeType;
  const agentId = nodeData ? resolveAgentId(nodeData) : null;
  const isAgentNode = nodeType === "agent" || nodeType === "supervisor";

  const nodeActivity = useMemo(
    () => (node ? findActivityForNode(executionActivities, node.id) : null),
    [executionActivities, node],
  );

  useEffect(() => {
    if (agents.length === 0) fetchAgents();
  }, [agents.length, fetchAgents]);

  useEffect(() => {
    if (!agentId) {
      requestAnimationFrame(() => {
        setAgentDetail(null);
        setAgentLoading(false);
      });
      return;
    }
    let cancelled = false;
    requestAnimationFrame(() => { if (!cancelled) setAgentLoading(true); });
    api
      .get<Agent>(`/agents/${agentId}`)
      .then((agent) => { if (!cancelled) setAgentDetail(agent); })
      .catch(() => { if (!cancelled) setAgentDetail(null); })
      .finally(() => { if (!cancelled) setAgentLoading(false); });
    return () => { cancelled = true; };
  }, [agentId]);

  const handleEditAgentSubmit = useCallback(async (values: AgentFormValues) => {
    if (!agentId) return;
    const enabledCount = countEnabledCategories(values.toolCategories);
    await updateAgent(agentId, {
      name: values.name.trim(),
      description: values.description.trim(),
      model_id: values.modelId.trim(),
      system_prompt: values.systemPrompt.trim() || undefined,
      memory_enabled: values.memoryEnabled,
      timeout_seconds: values.timeoutEnabled ? values.timeoutSeconds : 0,
      tool_categories: enabledCount > 0 ? values.toolCategories : undefined,
    });
    const refreshed = await api.get<Agent>(`/agents/${agentId}`);
    setAgentDetail(refreshed);
  }, [agentId, updateAgent]);

  if (!node) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Select a node to view properties
      </div>
    );
  }

  const customConfig = nodeData?.config
    ? Object.fromEntries(
        Object.entries(nodeData.config as Record<string, unknown>)
          .filter(([k]) => !["agentId", "supervisorAgentId", "workerAgentIds"].includes(k)),
      )
    : null;

  const handleAgentChange = (selectedAgentId: string) => {
    onUpdateNode(node.id, { ...nodeData, agent_id: selectedAgentId });
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <Tabs defaultValue="config" className="flex flex-col flex-1 min-h-0">
        <div className="shrink-0 border-b border-border px-1">
          <TabsList className="h-9 w-full bg-transparent p-0 gap-0">
            <TabsTrigger value="config" className={TAB_CLS}>
              <Settings2 className="h-3 w-3" />
              Config
            </TabsTrigger>
            <TabsTrigger value="io" className={TAB_CLS}>
              <ArrowDownToLine className="h-3 w-3" />
              I/O
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Config tab ── */}
        <TabsContent value="config" className="flex-1 overflow-auto mt-0 p-4">
          <div className="space-y-4">
            {isAgentNode && (
              <>
                {/* Agent header: icon + name + description + actions */}
                <AgentHeader
                  agentDetail={agentDetail}
                  agentLoading={agentLoading}
                  agentId={agentId}
                  isEditMode={isEditMode}
                  agents={agents}
                  onAgentChange={handleAgentChange}
                  onEditAgent={() => setShowEditAgent(true)}
                />

                {/* Agent details preview */}
                {agentId && (
                  <AgentDetailPreview
                    agentDetail={agentDetail}
                    agentLoading={agentLoading}
                    agentId={agentId}
                  />
                )}
              </>
            )}

            {nodeType === "subgraph" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Subgraph ID</Label>
                <Input
                  value={(nodeData?.subgraph_id as string) || ""}
                  onChange={(e) => onUpdateNode(node.id, { ...nodeData, subgraph_id: e.target.value })}
                  placeholder="Graph ID"
                  disabled={!isEditMode}
                />
              </div>
            )}

            {nodeType === "condition" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Condition Expression</Label>
                <Input
                  value={(nodeData?.condition as string) || ""}
                  onChange={(e) => onUpdateNode(node.id, { ...nodeData, condition: e.target.value })}
                  placeholder="e.g. confidence > 0.7"
                  disabled={!isEditMode}
                />
              </div>
            )}

            {customConfig && Object.keys(customConfig).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Custom Config
                </h4>
                <pre className="text-xs bg-muted/50 rounded-md p-2.5 overflow-auto max-h-48 whitespace-pre-wrap break-all text-foreground/80 font-mono">
                  {JSON.stringify(customConfig, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── I/O tab ── */}
        <TabsContent value="io" className="flex-1 overflow-auto mt-0 p-4">
          <IoTabContent nodeActivity={nodeActivity} />
        </TabsContent>
      </Tabs>

      {/* Edit agent modal */}
      {agentDetail && (
        <AgentFormDialog
          isOpen={showEditAgent}
          onOpenChange={setShowEditAgent}
          title={`Edit "${agentDetail.name}"`}
          description="Modify agent configuration."
          submitLabel="Save"
          initialValues={agentToFormValues(agentDetail)}
          onSubmit={handleEditAgentSubmit}
        />
      )}
    </div>
  );
}

/* ── Agent header: always shows icon+name+desc, edit mode adds dropdown+gear ── */
function AgentHeader({
  agentDetail,
  agentLoading,
  agentId,
  isEditMode,
  agents,
  onAgentChange,
  onEditAgent,
}: {
  agentDetail: Agent | null;
  agentLoading: boolean;
  agentId: string | null;
  isEditMode: boolean;
  agents: Agent[];
  onAgentChange: (id: string) => void;
  onEditAgent: () => void;
}) {
  if (!agentId && !isEditMode) {
    return <p className="text-xs text-muted-foreground italic">No agent assigned</p>;
  }

  const agentCard = agentLoading ? (
    <div className="rounded-lg bg-muted/30 border border-border/50 p-3">
      <div className="text-xs text-muted-foreground animate-pulse">Loading...</div>
    </div>
  ) : agentDetail ? (
    <div className="rounded-lg bg-muted/30 border border-border/50 p-3 space-y-3">
      <div className="flex items-start gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate">{agentDetail.name}</p>
            <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono shrink-0">
              v{agentDetail.version}
            </Badge>
          </div>
          {agentDetail.description && (
            <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
              {agentDetail.description}
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-border/40 pt-3">
        <AgentConfigGrid
          modelId={agentDetail.model_id}
          timeoutSeconds={agentDetail.timeout_seconds}
          memoryEnabled={agentDetail.memory_enabled}
          size="sm"
        />
      </div>
    </div>
  ) : agentId ? (
    <div className="rounded-lg bg-muted/30 border border-dashed border-border/50 p-3">
      <p className="text-xs text-muted-foreground italic">Agent not found</p>
    </div>
  ) : null;

  return (
    <div className="space-y-2.5">
      {isEditMode && (
        <div className="flex items-center gap-1.5">
          <Select value={agentId || ""} onValueChange={onAgentChange}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Select an agent" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <div className="flex items-center gap-2">
                    <Bot className="h-3 w-3 text-primary shrink-0" />
                    <span>{a.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">v{a.version}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {agentId && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 shrink-0"
              onClick={onEditAgent}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
      {agentCard}
    </div>
  );
}

/* ── Agent details preview ── */
function AgentDetailPreview({
  agentDetail,
  agentLoading,
  agentId,
}: {
  agentDetail: Agent | null;
  agentLoading: boolean;
  agentId: string;
}) {
  if (agentLoading) {
    return <div className="text-xs text-muted-foreground animate-pulse py-1">Loading agent...</div>;
  }
  if (!agentDetail) {
    return <p className="text-xs text-muted-foreground italic">Agent not found ({agentId})</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <MessageSquare className="h-3 w-3" />
          System Prompt
        </div>
        <PromptDisplay content={agentDetail.system_prompt || null} maxHeight="180px" />
      </div>
      <AgentToolsSummary toolCategories={agentDetail.tool_categories} />
    </div>
  );
}

/* ── I/O tab content ── */
function IoTabContent({ nodeActivity }: { nodeActivity: ExecutionActivity | null }) {
  if (!nodeActivity) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Info className="h-6 w-6 mb-1.5 opacity-40" />
        <p className="text-xs text-center">Run the graph to see execution data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {nodeActivity.status === "completed" && <CheckCircle2 className="h-4 w-4 text-success" />}
        {nodeActivity.status === "failed" && <XCircle className="h-4 w-4 text-destructive" />}
        {nodeActivity.status === "running" && <Clock className="h-4 w-4 text-primary animate-pulse" />}
        <span className="text-sm font-medium capitalize">{nodeActivity.status}</span>
        {nodeActivity.durationMs != null && (
          <span className="text-xs text-muted-foreground ml-auto">
            {formatDurationMs(nodeActivity.durationMs)}
          </span>
        )}
      </div>

      {nodeActivity.inputPrompt && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            <ArrowDownToLine className="h-3 w-3" />
            Input
          </div>
          <div className="text-sm bg-muted/50 rounded-md p-2.5 whitespace-pre-wrap max-h-40 overflow-auto">
            {nodeActivity.inputPrompt}
          </div>
        </div>
      )}

      {nodeActivity.agentResponse && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            <ArrowUpFromLine className="h-3 w-3" />
            Output
          </div>
          <div className="text-sm bg-muted/50 rounded-md p-2.5 max-h-40 overflow-auto whitespace-pre-wrap">
            {nodeActivity.agentResponse}
          </div>
        </div>
      )}

      {nodeActivity.model && (
        <PropRow label="Model">
          <span className="text-xs font-mono">{formatModelName(nodeActivity.model)}</span>
        </PropRow>
      )}
      {(nodeActivity.toolCallCount ?? 0) > 0 && (
        <PropRow label="Tool calls">
          <span className="text-xs">{nodeActivity.toolCallCount}</span>
        </PropRow>
      )}

      {nodeActivity.children && nodeActivity.children.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Steps
          </h4>
          <div className="space-y-1">
            {nodeActivity.children.map((child) => (
              <div
                key={child.id}
                className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1.5"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {child.status === "completed" && <CheckCircle2 className="h-3 w-3 text-success shrink-0" />}
                  {child.status === "failed" && <XCircle className="h-3 w-3 text-destructive shrink-0" />}
                  {child.status === "running" && <Clock className="h-3 w-3 text-primary animate-pulse shrink-0" />}
                  <span className="truncate">{child.label}</span>
                </div>
                {child.durationMs != null && (
                  <span className="text-muted-foreground shrink-0 ml-2">
                    {formatDurationMs(child.durationMs)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
