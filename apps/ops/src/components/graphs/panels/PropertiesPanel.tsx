import { useState, useEffect, useMemo } from "react";
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
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

interface PropertiesPanelProps {
  node: Node | null;
  onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
  isEditMode?: boolean;
  executionActivities?: ExecutionActivity[];
}

function PropRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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
  knowledge: "Knowledge",
  filesystem: "Filesystem",
  shell: "Shell",
  network: "Network",
  file_storage: "File Storage",
  human_interaction: "Human Interaction",
  image_generation: "Image Generation",
  custom_tools: "Custom Tools",
  mini_apps: "Mini Apps",
  github: "GitHub",
  web: "Web",
  git: "Git",
  scheduling: "Scheduling",
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
  "h-8 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2.5 gap-1 text-xs";

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

export function PropertiesPanel({
  node,
  onUpdateNode,
  isEditMode = true,
  executionActivities = [],
}: PropertiesPanelProps) {
  const [agentDetail, setAgentDetail] = useState<Agent | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);

  const nodeData = node?.data as Record<string, unknown> | undefined;
  const nodeType = ((nodeData?.type || node?.type || "agent") as string) as NodeType;
  const agentId = nodeData ? resolveAgentId(nodeData) : null;
  const isAgentNode = nodeType === "agent" || nodeType === "supervisor";

  const nodeActivity = useMemo(
    () => (node ? findActivityForNode(executionActivities, node.id) : null),
    [executionActivities, node],
  );

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

  if (!node) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Select a node to view properties
      </div>
    );
  }

  const config = NODE_CONFIG[nodeType];
  const NodeIcon = config?.icon;

  const customConfig = nodeData?.config
    ? Object.fromEntries(
        Object.entries(
          nodeData.config as Record<string, unknown>,
        ).filter(
          ([k]) =>
            !["agentId", "supervisorAgentId", "workerAgentIds"].includes(k),
        ),
      )
    : null;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Node header */}
      <div className="shrink-0 border-b border-border px-4 py-2 flex items-center gap-2.5">
        {NodeIcon && (
          <div
            className={`w-7 h-7 rounded-md flex items-center justify-center ${config.iconBgClass}`}
          >
            <NodeIcon className="h-3.5 w-3.5" />
          </div>
        )}
        <div className="min-w-0">
          <div className="font-semibold text-xs leading-tight truncate">
            {(nodeData?.label as string) || node.id}
          </div>
          <div className="text-[10px] text-muted-foreground leading-tight">
            {config?.label} &middot;{" "}
            <span className="font-mono">{node.id}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        defaultValue={isAgentNode ? "agent" : "config"}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="shrink-0 border-b border-border px-1">
          <TabsList className="h-8 w-full justify-start bg-transparent p-0 gap-0">
            {isAgentNode && (
              <TabsTrigger value="agent" className={TAB_CLS}>
                <Bot className="h-3 w-3" />
                Agent
              </TabsTrigger>
            )}
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

        {/* ── Agent tab ── */}
        {isAgentNode && (
          <TabsContent value="agent" className="flex-1 overflow-auto mt-0 p-4">
            {!agentId ? (
              <p className="text-xs text-muted-foreground italic">
                No agent assigned to this node
              </p>
            ) : agentLoading ? (
              <div className="text-xs text-muted-foreground animate-pulse py-1">
                Loading agent...
              </div>
            ) : agentDetail ? (
              <div className="space-y-4">
                {/* Agent identity */}
                <div className="flex items-start gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{agentDetail.name}</p>
                      <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono shrink-0">
                        v{agentDetail.version}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                      {agentDetail.description || "No description"}
                    </p>
                  </div>
                </div>

                <AgentConfigGrid
                  modelId={agentDetail.model_id}
                  timeoutSeconds={agentDetail.timeout_seconds}
                  memoryEnabled={agentDetail.memory_enabled}
                  size="sm"
                />

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <MessageSquare className="h-3 w-3" />
                    System Prompt
                  </div>
                  <PromptDisplay
                    content={agentDetail.system_prompt || null}
                    maxHeight="180px"
                  />
                </div>

                {/* Tools */}
                <AgentToolsSummary toolCategories={agentDetail.tool_categories} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Agent not found ({agentId})
              </p>
            )}
          </TabsContent>
        )}

        {/* ── Config tab ── */}
        <TabsContent value="config" className="flex-1 overflow-auto mt-0 p-4">
          <div className="space-y-3">
            {/* Editable label */}
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input
                value={(nodeData?.label as string) || ""}
                onChange={(e) =>
                  onUpdateNode(node.id, {
                    ...nodeData,
                    label: e.target.value,
                  })
                }
                placeholder={config?.label}
                disabled={!isEditMode}
              />
            </div>

            {/* Read-only info */}
            <div className="space-y-0.5">
              <PropRow label="Type">
                <span className="text-xs font-medium">{config?.label}</span>
              </PropRow>
              <PropRow label="Node ID">
                <span className="font-mono text-[10px] truncate block max-w-[180px]">
                  {node.id}
                </span>
              </PropRow>
            </div>

            {/* Agent ID (editable) */}
            {isAgentNode && (
              <div className="space-y-1.5">
                <Label className="text-xs">Agent ID</Label>
                <Input
                  value={(nodeData?.agent_id as string) || ""}
                  onChange={(e) =>
                    onUpdateNode(node.id, {
                      ...nodeData,
                      agent_id: e.target.value,
                    })
                  }
                  placeholder="Agent ID"
                  disabled={!isEditMode}
                />
              </div>
            )}

            {/* Subgraph ID */}
            {nodeType === "subgraph" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Subgraph ID</Label>
                <Input
                  value={(nodeData?.subgraph_id as string) || ""}
                  onChange={(e) =>
                    onUpdateNode(node.id, {
                      ...nodeData,
                      subgraph_id: e.target.value,
                    })
                  }
                  placeholder="Graph ID"
                  disabled={!isEditMode}
                />
              </div>
            )}

            {/* Condition */}
            {nodeType === "condition" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Condition Expression</Label>
                <Input
                  value={(nodeData?.condition as string) || ""}
                  onChange={(e) =>
                    onUpdateNode(node.id, {
                      ...nodeData,
                      condition: e.target.value,
                    })
                  }
                  placeholder="e.g. confidence > 0.7"
                  disabled={!isEditMode}
                />
              </div>
            )}

            {/* Custom Config JSON */}
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
          {nodeActivity ? (
            <div className="space-y-4">
              {/* Status + duration */}
              <div className="flex items-center gap-2">
                {nodeActivity.status === "completed" && (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                )}
                {nodeActivity.status === "failed" && (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                {nodeActivity.status === "running" && (
                  <Clock className="h-4 w-4 text-primary animate-pulse" />
                )}
                <span className="text-sm font-medium capitalize">
                  {nodeActivity.status}
                </span>
                {nodeActivity.durationMs != null && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatDurationMs(nodeActivity.durationMs)}
                  </span>
                )}
              </div>

              {/* Input */}
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

              {/* Output */}
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

              {/* Meta */}
              {nodeActivity.model && (
                <PropRow label="Model">
                  <span className="text-xs font-mono">
                    {formatModelName(nodeActivity.model)}
                  </span>
                </PropRow>
              )}
              {(nodeActivity.toolCallCount ?? 0) > 0 && (
                <PropRow label="Tool calls">
                  <span className="text-xs">
                    {nodeActivity.toolCallCount}
                  </span>
                </PropRow>
              )}

              {/* Steps */}
              {nodeActivity.children &&
                nodeActivity.children.length > 0 && (
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
                            {child.status === "completed" && (
                              <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                            )}
                            {child.status === "failed" && (
                              <XCircle className="h-3 w-3 text-destructive shrink-0" />
                            )}
                            {child.status === "running" && (
                              <Clock className="h-3 w-3 text-primary animate-pulse shrink-0" />
                            )}
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
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Info className="h-6 w-6 mb-1.5 opacity-40" />
              <p className="text-xs text-center">
                Run the graph to see execution data.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
