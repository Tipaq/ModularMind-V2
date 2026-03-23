import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Plus, Copy, Trash2, Check, X } from "lucide-react";
import {
  Button,
  Badge,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  PageHeader,
  EmptyState,
  ResourceTable,
  ResourceFilters,
  formatModelName,
} from "@modularmind/ui";
import type { ResourceColumn, ResourceFilterConfig } from "@modularmind/ui";
import type { Agent } from "@modularmind/api-client";
import { useAgentsStore } from "../stores/agents";
import { CreateAgentDialog } from "../components/agents/CreateAgentDialog";

const filterConfigs: ResourceFilterConfig[] = [
  { key: "search", label: "Search", type: "search", placeholder: "Search agents..." },
];

function ModelBadge({ modelId }: { modelId: string }) {
  return (
    <Badge variant="outline" className="text-[10px] py-0 px-1.5">
      {formatModelName(modelId)}
    </Badge>
  );
}

function ToolCount({ categories }: { categories: Record<string, boolean | Record<string, boolean>> }) {
  const count = Object.values(categories).filter((v) =>
    typeof v === "boolean" ? v : Object.values(v).some(Boolean),
  ).length;
  return (
    <Badge variant="outline" className="text-[10px] py-0 px-1.5">
      {count} tool{count !== 1 ? "s" : ""}
    </Badge>
  );
}

export default function Agents() {
  const navigate = useNavigate();
  const {
    agents, loading, page, totalPages, total,
    fetchAgents, deleteAgent, duplicateAgent,
  } = useAgentsStore();

  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    fetchAgents(1);
  }, [fetchAgents]);

  const filtered = useMemo(() => {
    if (!filterValues.search) return agents;
    const s = filterValues.search.toLowerCase();
    return agents.filter(
      (a) => a.name.toLowerCase().includes(s) || a.description?.toLowerCase().includes(s),
    );
  }, [agents, filterValues.search]);

  const handleRowClick = useCallback(
    (agent: Agent) => navigate(`/agents/${agent.id}`),
    [navigate],
  );

  const handleDelete = useCallback(
    async (agent: Agent) => {
      if (!confirm(`Delete "${agent.name}"?`)) return;
      await deleteAgent(agent.id);
    },
    [deleteAgent],
  );

  const columns: ResourceColumn<Agent>[] = [
    {
      key: "name",
      header: "Agent",
      render: (a) => (
        <div>
          <p className="font-medium text-sm">{a.name}</p>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {a.description || "No description"}
          </p>
        </div>
      ),
    },
    {
      key: "model_id",
      header: "Model",
      className: "hidden md:table-cell",
      render: (a) => <ModelBadge modelId={a.model_id} />,
    },
    {
      key: "version",
      header: "Version",
      className: "hidden lg:table-cell",
      render: (a) => (
        <Badge variant="outline" className="font-mono text-[10px] py-0 px-1.5">
          v{a.version}
        </Badge>
      ),
    },
    {
      key: "memory",
      header: "Memory",
      className: "hidden lg:table-cell",
      render: (a) =>
        a.memory_enabled ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <X className="h-4 w-4 text-muted-foreground" />
        ),
    },
    {
      key: "tools",
      header: "Tools",
      className: "hidden md:table-cell",
      render: (a) => <ToolCount categories={a.tool_categories} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Bot}
        gradient="from-primary to-primary/70"
        title="Agents"
        description="Configure and manage AI agents"
        actions={
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Agent
          </Button>
        }
      />

      <ResourceFilters
        filters={filterConfigs}
        values={filterValues}
        onChange={(key, value) => setFilterValues((prev) => ({ ...prev, [key]: value }))}
      />

      <ResourceTable<Agent>
        items={filtered}
        columns={columns}
        pagination={{ page, totalPages, totalItems: total }}
        onPageChange={(p) => fetchAgents(p)}
        onRowClick={handleRowClick}
        isLoading={loading}
        emptyState={
          <EmptyState
            icon={Bot}
            title="No agents yet"
            description="Create your first agent to get started."
            action={
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Agent
              </Button>
            }
          />
        }
        keyExtractor={(a) => a.id}
        rowActions={(a) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">...</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => duplicateAgent(a.id)}>
                <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDelete(a)} className="text-destructive">
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      <CreateAgentDialog
        isOpen={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={(agent) => navigate(`/agents/${agent.id}`)}
      />
    </div>
  );
}
