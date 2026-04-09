import {
  Bot,
  Settings2,
  MessageSquare,
  Wrench,
} from "lucide-react";
import {
  Input,
  Label,
  Badge,
  Button,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  AgentConfigGrid,
  PromptDisplay,
} from "@modularmind/ui";
import type { Agent } from "@modularmind/api-client";
import type { NodeType } from "../nodes/nodeConfig";
import type { AgentFormValues } from "../../agents/AgentFormDialog";

export function resolveAgentId(data: Record<string, unknown>): string | null {
  const fromConfig = (data.config as Record<string, unknown> | undefined)
    ?.agentId as string | undefined;
  if (fromConfig) return fromConfig;
  if (data.agent_id) return data.agent_id as string;
  return null;
}

export function agentToFormValues(agent: Agent): AgentFormValues {
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

interface AgentHeaderProps {
  agentDetail: Agent | null;
  agentLoading: boolean;
  agentId: string | null;
  isEditMode: boolean;
  agents: Agent[];
  onAgentChange: (id: string) => void;
  onEditAgent: () => void;
}

function AgentHeader({
  agentDetail,
  agentLoading,
  agentId,
  isEditMode,
  agents,
  onAgentChange,
  onEditAgent,
}: AgentHeaderProps) {
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

interface AgentDetailPreviewProps {
  agentDetail: Agent | null;
  agentLoading: boolean;
  agentId: string;
}

function AgentDetailPreview({
  agentDetail,
  agentLoading,
  agentId,
}: AgentDetailPreviewProps) {
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

interface NodeConfigPanelProps {
  nodeId: string;
  nodeData: Record<string, unknown>;
  nodeType: NodeType;
  agentId: string | null;
  isAgentNode: boolean;
  isEditMode: boolean;
  agentDetail: Agent | null;
  agentLoading: boolean;
  agents: Agent[];
  onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
  onAgentChange: (id: string) => void;
  onEditAgent: () => void;
}

export function NodeConfigPanel({
  nodeId,
  nodeData,
  nodeType,
  agentId,
  isAgentNode,
  isEditMode,
  agentDetail,
  agentLoading,
  agents,
  onUpdateNode,
  onAgentChange,
  onEditAgent,
}: NodeConfigPanelProps) {
  const customConfig = nodeData?.config
    ? Object.fromEntries(
        Object.entries(nodeData.config as Record<string, unknown>)
          .filter(([k]) => !["agentId", "supervisorAgentId", "workerAgentIds"].includes(k)),
      )
    : null;

  return (
    <div className="space-y-4">
      {isAgentNode && (
        <>
          <AgentHeader
            agentDetail={agentDetail}
            agentLoading={agentLoading}
            agentId={agentId}
            isEditMode={isEditMode}
            agents={agents}
            onAgentChange={onAgentChange}
            onEditAgent={onEditAgent}
          />

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
            onChange={(e) => onUpdateNode(nodeId, { ...nodeData, subgraph_id: e.target.value })}
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
            onChange={(e) => onUpdateNode(nodeId, { ...nodeData, condition: e.target.value })}
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
  );
}
