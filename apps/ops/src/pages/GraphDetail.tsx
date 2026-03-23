import { lazy, Suspense, useEffect, useCallback, useState, useMemo } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  GitFork,
  Save,
  Trash2,
  RefreshCw,
  Pencil,
  X,
  CheckCircle,
  AlertTriangle,
  Settings,
  ShieldAlert,
} from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@modularmind/ui";
import type { Node, Edge } from "@xyflow/react";
import type { NodeInput, EdgeInput, ValidationIssue } from "@modularmind/api-client";
import type { ExecutionActivity } from "@modularmind/ui";
import { useGraphsStore } from "../stores/graphs";
import { validateGraph } from "../lib/graph-validation";
import {
  GraphSettingsPanel,
  type GraphSettings,
} from "../components/graphs/panels/GraphSettingsPanel";
import { GraphPlayground } from "../components/graphs/GraphPlayground";

const GraphCanvas = lazy(() =>
  import("../components/graphs/GraphCanvas").then((m) => ({
    default: m.GraphCanvas,
  })),
);

function flowNodesToInput(nodes: Node[]): NodeInput[] {
  return nodes.map((n) => ({
    id: n.id,
    type: String(n.data?.type ?? "agent"),
    data: {
      ...(n.data as Record<string, unknown>),
      position: n.position,
    },
  }));
}

function flowEdgesToInput(edges: Edge[]): EdgeInput[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    data: (e.data as Record<string, unknown>) ?? undefined,
  }));
}

export function GraphDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(searchParams.get("edit") === "true");

  useEffect(() => {
    if (searchParams.has("edit")) {
      searchParams.delete("edit");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const {
    selectedGraph: graph,
    loading,
    fetchGraph,
    updateGraph,
    deleteGraph,
  } = useGraphsStore();

  useEffect(() => {
    if (id) fetchGraph(id);
  }, [id, fetchGraph]);

  const [graphSettings, setGraphSettings] = useState<GraphSettings>({
    name: "",
    description: "",
    entryNodeId: null,
    timeoutSeconds: 300,
    timeoutEnabled: true,
    modelOverride: null,
  });

  useEffect(() => {
    if (graph) {
      const timeout = graph.timeout_seconds || 0;
      setGraphSettings({
        name: graph.name,
        description: graph.description || "",
        entryNodeId: graph.entry_node_id,
        timeoutSeconds: timeout > 0 ? timeout : 300,
        timeoutEnabled: timeout > 0,
        modelOverride: null,
      });
    }
  }, [graph]);

  const [currentNodes, setCurrentNodes] = useState<Node[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [currentEdges, setCurrentEdges] = useState<Edge[]>([]);
  const [canvasKey, setCanvasKey] = useState(0);
  const [activeTab, setActiveTab] = useState("settings");
  const [executionActivities, setExecutionActivities] = useState<ExecutionActivity[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleActivitiesChange = useCallback(
    (activities: ExecutionActivity[]) => {
      setExecutionActivities(activities);
    },
    [],
  );

  const handleNodesEdgesChange = useCallback((nodes: Node[], edges: Edge[]) => {
    setCurrentNodes(nodes);
    setCurrentEdges(edges);
  }, []);

  const validationIssues: ValidationIssue[] = useMemo(
    () => validateGraph(currentNodes, graphSettings.entryNodeId),
    [currentNodes, graphSettings.entryNodeId],
  );

  const isValid = validationIssues.length === 0;

  const handleUpdateSettings = useCallback(
    (patch: Partial<GraphSettings>) => {
      setGraphSettings((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  const handleSave = useCallback(
    async (nodes: Node[], edges: Edge[]) => {
      if (!id) return;
      setSaving(true);
      try {
        await updateGraph(id, {
          name: graphSettings.name,
          description: graphSettings.description || undefined,
          entry_node_id: graphSettings.entryNodeId || undefined,
          timeout_seconds: graphSettings.timeoutEnabled ? graphSettings.timeoutSeconds : 0,
          nodes: flowNodesToInput(nodes),
          edges: flowEdgesToInput(edges),
        });
      } finally {
        setSaving(false);
      }
    },
    [id, updateGraph, graphSettings],
  );

  const triggerSave = useCallback(() => {
    const canvas = document.querySelector("[data-graph-canvas]");
    if (canvas) canvas.dispatchEvent(new CustomEvent("graph:save"));
  }, []);

  const handleDelete = useCallback(async () => {
    if (!graph) return;
    setDeleting(true);
    try {
      await deleteGraph(graph.id);
      navigate("/graphs");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [graph, deleteGraph, navigate]);

  const handleCancelEdit = useCallback(() => {
    if (graph) {
      const timeout = graph.timeout_seconds || 0;
      setGraphSettings({
        name: graph.name,
        description: graph.description || "",
        entryNodeId: graph.entry_node_id,
        timeoutSeconds: timeout > 0 ? timeout : 300,
        timeoutEnabled: timeout > 0,
        modelOverride: null,
      });
      setCanvasKey((k) => k + 1);
    }
    setIsEditMode(false);
  }, [graph]);

  if (loading || !graph) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Header */}
      <div className="border-b border-border px-5 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/graphs"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Graphs
            </Link>
            <div className="h-4 w-px bg-border" />
            <GitFork className="h-5 w-5 text-warning" />
            {isEditMode ? (
              <input
                value={graphSettings.name}
                onChange={(e) =>
                  handleUpdateSettings({ name: e.target.value })
                }
                className="text-lg font-semibold bg-transparent border-b border-border focus:border-primary outline-none px-1"
                placeholder="Graph name"
              />
            ) : (
              <h1 className="text-lg font-semibold">{graphSettings.name}</h1>
            )}
            <Badge variant="outline" className="font-mono text-xs">
              v{graph.version}
            </Badge>

            {isValid ? (
              <div className="flex items-center gap-1 text-success text-xs">
                <CheckCircle className="h-3.5 w-3.5" />
                Valid
              </div>
            ) : (
              <div className="flex items-center gap-1 text-warning text-xs">
                <AlertTriangle className="h-3.5 w-3.5" />
                {validationIssues.length} issue
                {validationIssues.length !== 1 ? "s" : ""}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isEditMode ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={triggerSave}
                  disabled={saving}
                >
                  <Save className="h-4 w-4 mr-1" />
                  {saving ? "Saving..." : "Save"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditMode(true)}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Top: Canvas (left) + Settings/Issues panel (right) */}
      <div className="flex min-h-0" style={{ flex: "1 1 55%" }}>
        {/* Canvas */}
        <div className="flex-1 min-w-0 border-r border-border">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <GraphCanvas
              key={canvasKey}
              graph={graph}
              onSave={handleSave}
              saving={saving}
              isEditMode={isEditMode}
              onNodesEdgesChange={handleNodesEdgesChange}
              executionActivities={executionActivities}
            />
          </Suspense>
        </div>

        {/* Right panel: Settings + Validation */}
        <div className="w-[320px] shrink-0 flex flex-col min-h-0">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-col flex-1 min-h-0"
          >
            <TabsList className="w-full px-0 h-9 shrink-0">
              <TabsTrigger value="settings" className="text-xs gap-1 flex-1 justify-center">
                <Settings className="h-3 w-3" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="validation" className="text-xs gap-1 flex-1 justify-center">
                <ShieldAlert className="h-3 w-3" />
                Issues{validationIssues.length > 0 ? ` (${validationIssues.length})` : ""}
              </TabsTrigger>
            </TabsList>

            <div className="overflow-y-auto flex-1 min-h-0">
              <TabsContent value="settings" className="mt-0">
                <GraphSettingsPanel
                  settings={graphSettings}
                  isEditMode={isEditMode}
                  onUpdate={handleUpdateSettings}
                />
              </TabsContent>

              <TabsContent value="validation" className="mt-0">
                {validationIssues.length > 0 ? (
                  <div className="p-4 space-y-2">
                    {validationIssues.map((issue, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start gap-2 text-sm ${
                          issue.type === "error"
                            ? "text-destructive"
                            : "text-warning"
                        }`}
                      >
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{issue.message}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 flex flex-col items-center justify-center text-muted-foreground">
                    <CheckCircle className="h-5 w-5 mb-1.5 text-success" />
                    <p className="text-xs">No issues found</p>
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      {/* Bottom: Playground */}
      <div className="border-t border-border min-h-0" style={{ flex: "1 1 45%" }}>
        <GraphPlayground
          graphId={graph.id}
          graphName={graphSettings.name}
          isValid={isValid}
          validationIssues={validationIssues}
          onActivitiesChange={handleActivitiesChange}
        />
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={`Delete "${graph.name}"?`}
        description="This action cannot be undone. The graph and all its nodes will be permanently removed."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
