import { lazy, Suspense, useEffect, useCallback, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
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

export default function GraphDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

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
  });

  useEffect(() => {
    if (graph) {
      setGraphSettings({
        name: graph.name,
        description: graph.description || "",
        entryNodeId: graph.entry_node_id,
        timeoutSeconds: graph.timeout_seconds || 300,
      });
    }
  }, [graph]);

  const [currentNodes, setCurrentNodes] = useState<Node[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [currentEdges, setCurrentEdges] = useState<Edge[]>([]);
  const [canvasKey, setCanvasKey] = useState(0);
  const [activeTab, setActiveTab] = useState("settings");
  const [executionActivities, setExecutionActivities] = useState<ExecutionActivity[]>([]);

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
          timeout_seconds: graphSettings.timeoutSeconds,
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
    if (!graph || !confirm(`Delete "${graph.name}"?`)) return;
    await deleteGraph(graph.id);
    navigate("/graphs");
  }, [graph, deleteGraph, navigate]);

  const handleCancelEdit = useCallback(() => {
    if (graph) {
      setGraphSettings({
        name: graph.name,
        description: graph.description || "",
        entryNodeId: graph.entry_node_id,
        timeoutSeconds: graph.timeout_seconds || 300,
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
      <div className="border-b border-border px-5 py-3">
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

            {/* Validation badge */}
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
                  onClick={handleDelete}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content: 50/50 split */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Canvas + Bottom Panel */}
        <div className="flex flex-col w-1/2 min-w-0 border-r border-border">
          {/* Canvas — 60% */}
          <div className="min-h-0" style={{ flex: "0 0 60%" }}>
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

          {/* Bottom Panel — 40% */}
          <div className="border-t border-border overflow-hidden flex flex-col" style={{ flex: "0 0 40%" }}>
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex flex-col flex-1 min-h-0"
            >
              <TabsList className="w-full px-0 h-10">
                <TabsTrigger
                  value="settings"
                  className="text-xs gap-1 flex-1"
                >
                  <Settings className="h-3 w-3" />
                  Settings
                </TabsTrigger>
                {validationIssues.length > 0 && (
                  <TabsTrigger
                    value="validation"
                    className="text-xs gap-1 flex-1"
                  >
                    <ShieldAlert className="h-3 w-3" />
                    Issues ({validationIssues.length})
                  </TabsTrigger>
                )}
              </TabsList>

              <div className="overflow-y-auto flex-1 min-h-0">
                <TabsContent value="settings" className="mt-0">
                  <GraphSettingsPanel
                    settings={graphSettings}
                    nodes={currentNodes}
                    isEditMode={isEditMode}
                    onUpdate={handleUpdateSettings}
                  />
                </TabsContent>

                {validationIssues.length > 0 && (
                  <TabsContent value="validation" className="mt-0">
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
                          {issue.type === "error" ? (
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          )}
                          <span>{issue.message}</span>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                )}
              </div>
            </Tabs>
          </div>
        </div>

        {/* Right: Playground */}
        <div className="w-1/2 min-w-0 h-full overflow-hidden">
          <GraphPlayground
            graphId={graph.id}
            graphName={graphSettings.name}
            isValid={isValid}
            validationIssues={validationIssues}
            onActivitiesChange={handleActivitiesChange}
          />
        </div>
      </div>
    </div>
  );
}
