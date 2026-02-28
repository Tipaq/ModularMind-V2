import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Plus, Copy, Trash2 } from "lucide-react";
import {
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  stripProvider,
  isLocalModel,
  PageHeader,
} from "@modularmind/ui";
import type { Agent, AgentCreate, AgentUpdate } from "@modularmind/api-client";
import { EmptyState } from "../components/shared/EmptyState";
import { ResourceTable } from "../components/shared/ResourceTable";
import { ResourceFilters } from "../components/shared/ResourceFilters";
import { AgentForm } from "../components/agents/AgentForm";
import { useAgentsStore } from "../stores/agents";
import type { ResourceColumn, ResourceFilterConfig, SortState } from "../lib/types";

const filterConfigs: ResourceFilterConfig[] = [
  { key: "search", label: "Search", type: "search", placeholder: "Search agents..." },
  {
    key: "template",
    label: "Template",
    type: "select",
    placeholder: "All",
    options: [
      { value: "agent", label: "Agents only" },
      { value: "template", label: "Templates only" },
    ],
  },
];

export default function Agents() {
  const navigate = useNavigate();
  const {
    agents,
    loading,
    page,
    totalPages,
    total,
    fetchAgents,
    createAgent,
    deleteAgent,
    duplicateAgent,
  } = useAgentsStore();

  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchAgents(1);
  }, [fetchAgents]);

  // Client-side filtering + sorting
  const filtered = useMemo(() => {
    let result = agents;

    if (filterValues.search) {
      const s = filterValues.search.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(s) ||
          (a.description?.toLowerCase().includes(s) ?? false) ||
          a.model_id.toLowerCase().includes(s),
      );
    }

    if (filterValues.template) {
      result = result.filter((a) =>
        filterValues.template === "template" ? a.is_template : !a.is_template,
      );
    }

    if (filterValues.sort) {
      result = [...result].sort((a, b) => {
        switch (filterValues.sort) {
          case "name_asc":
            return a.name.localeCompare(b.name);
          case "name_desc":
            return b.name.localeCompare(a.name);
          case "model_asc":
            return a.model_id.localeCompare(b.model_id);
          case "model_desc":
            return b.model_id.localeCompare(a.model_id);
          default:
            return 0;
        }
      });
    }

    return result;
  }, [agents, filterValues]);

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const sortState = useMemo((): SortState | null => {
    const s = filterValues.sort;
    if (!s) return null;
    if (s.endsWith("_asc")) return { key: s.replace(/_asc$/, ""), direction: "asc" };
    if (s.endsWith("_desc")) return { key: s.replace(/_desc$/, ""), direction: "desc" };
    return { key: s, direction: "asc" };
  }, [filterValues.sort]);

  const handleColumnSort = useCallback((sortKey: string) => {
    setFilterValues((prev) => {
      const current = prev.sort || "";
      if (current === `${sortKey}_asc` || current === sortKey) {
        return { ...prev, sort: `${sortKey}_desc` };
      }
      if (current === `${sortKey}_desc`) {
        return { ...prev, sort: "" };
      }
      return { ...prev, sort: `${sortKey}_asc` };
    });
  }, []);

  const handleRowClick = useCallback(
    (agent: Agent) => {
      navigate(`/agents/${agent.id}`);
    },
    [navigate],
  );

  const handleCreate = async (data: AgentCreate | AgentUpdate) => {
    setCreating(true);
    try {
      const agent = await createAgent(data as AgentCreate);
      setShowCreateDialog(false);
      navigate(`/agents/${agent.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = useCallback(
    async (agent: Agent) => {
      if (!confirm(`Are you sure you want to delete "${agent.name}"?`)) return;
      try {
        await deleteAgent(agent.id);
      } catch {
        // Error is set in store
      }
    },
    [deleteAgent],
  );

  const handleDuplicate = useCallback(
    async (agent: Agent) => {
      try {
        await duplicateAgent(agent.id);
      } catch {
        // Error is set in store
      }
    },
    [duplicateAgent],
  );

  const columns: ResourceColumn<Agent>[] = [
    {
      key: "name",
      header: "Agent",
      sortKey: "name",
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
      key: "model",
      header: "Model",
      sortKey: "model",
      className: "hidden md:table-cell",
      render: (a) => (
        <span className="text-sm text-muted-foreground font-mono">
          {a.model_id ? stripProvider(a.model_id) : "—"}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      className: "hidden md:table-cell",
      render: (a) =>
        a.model_id ? (
          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
            {isLocalModel(a.model_id) ? "Local" : "Cloud"}
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      key: "version",
      header: "Version",
      className: "hidden lg:table-cell",
      render: (a) => (
        <Badge variant="outline" className="text-xs font-mono">
          v{a.version}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Bot}
        gradient="from-success to-success/70"
        title="Agents"
        description="Manage and test AI agents"
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
        onChange={handleFilterChange}
      />

      <ResourceTable<Agent>
        items={filtered}
        columns={columns}
        pagination={{
          page,
          totalPages,
          totalItems: total,
        }}
        onPageChange={(p) => fetchAgents(p)}
        onRowClick={handleRowClick}
        isLoading={loading}
        emptyState={
          <EmptyState
            icon={Bot}
            title="No agents yet"
            description="Create your first AI agent to get started."
            action={
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Agent
              </Button>
            }
          />
        }
        keyExtractor={(a) => a.id}
        sortState={sortState}
        onSort={handleColumnSort}
        rowActions={(a) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleDuplicate(a)}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDelete(a)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Agent</DialogTitle>
            <DialogDescription>
              Configure a new AI agent with a system prompt and model.
            </DialogDescription>
          </DialogHeader>
          <AgentForm
            onSubmit={handleCreate}
            onCancel={() => setShowCreateDialog(false)}
            loading={creating}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
