import { useState, useEffect, useMemo, useCallback } from "react";
import { Settings2, ArrowDownToLine } from "lucide-react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@modularmind/ui";
import type { ExecutionActivity } from "@modularmind/ui";
import type { Agent } from "@modularmind/api-client";
import type { Node } from "@xyflow/react";
import type { NodeType } from "../nodes/nodeConfig";
import { api } from "@modularmind/api-client";
import { useAgentsStore } from "../../../stores/agents";
import {
  AgentFormDialog,
  type AgentFormValues,
} from "../../agents/AgentFormDialog";
import { countEnabledCategories } from "../../agents/tool-categories";
import { NodeConfigPanel, resolveAgentId, agentToFormValues } from "./NodeConfigPanel";
import { NodeIoPanel, findActivityForNode } from "./NodeIoPanel";

interface PropertiesPanelProps {
  node: Node | null;
  onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
  isEditMode?: boolean;
  executionActivities?: ExecutionActivity[];
}

const TAB_CLS =
  "h-9 flex-1 justify-center rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2.5 gap-1 text-xs";

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

  const handleAgentChange = (selectedAgentId: string) => {
    onUpdateNode(node!.id, { ...nodeData, agent_id: selectedAgentId });
  };

  if (!node) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Select a node to view properties
      </div>
    );
  }

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

        <TabsContent value="config" className="flex-1 overflow-auto mt-0 p-4">
          <NodeConfigPanel
            nodeId={node.id}
            nodeData={nodeData || {}}
            nodeType={nodeType}
            agentId={agentId}
            isAgentNode={isAgentNode}
            isEditMode={isEditMode}
            agentDetail={agentDetail}
            agentLoading={agentLoading}
            agents={agents}
            onUpdateNode={onUpdateNode}
            onAgentChange={handleAgentChange}
            onEditAgent={() => setShowEditAgent(true)}
          />
        </TabsContent>

        <TabsContent value="io" className="flex-1 overflow-auto mt-0 p-4">
          <NodeIoPanel nodeActivity={nodeActivity} />
        </TabsContent>
      </Tabs>

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
