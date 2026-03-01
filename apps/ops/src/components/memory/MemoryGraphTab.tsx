import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button, Card, CardContent, Badge } from "@modularmind/ui";
import { useMemoryStore, type GraphNode } from "../../stores/memory";
import { MemoryTypeBadge } from "./MemoryTypeBadge";

let Graph: typeof import("graphology").default | null = null;
let Sigma: typeof import("sigma").Sigma | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let forceAtlas2Fn: any = null;

async function loadGraphLibs() {
  if (Graph && Sigma && forceAtlas2Fn) return;
  const [graphModule, sigmaModule, fa2Module] = await Promise.all([
    import("graphology"),
    import("sigma"),
    import("graphology-layout-forceatlas2"),
  ]);
  Graph = graphModule.default;
  Sigma = sigmaModule.Sigma;
  forceAtlas2Fn = fa2Module.default;
}

const TYPE_NODE_COLORS: Record<string, string> = {
  episodic: "#3b82f6",  // blue
  semantic: "#22c55e",  // green
  procedural: "#f59e0b", // amber
};

const EDGE_TYPE_COLORS: Record<string, string> = {
  entity_overlap: "#8b5cf6",      // purple
  same_category: "#06b6d4",       // cyan
  semantic_similarity: "#10b981", // emerald
};

export function MemoryGraphTab() {
  const { graphData, graphLoading, graphError, fetchGraphData } = useMemoryStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<InstanceType<typeof import("sigma").Sigma> | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [libsLoaded, setLibsLoaded] = useState(false);

  useEffect(() => {
    fetchGraphData();
    loadGraphLibs().then(() => setLibsLoaded(true));
  }, [fetchGraphData]);

  // Render graph when both data and libs are ready
  useEffect(() => {
    if (!graphData || !libsLoaded || !containerRef.current || !Graph || !Sigma || !forceAtlas2Fn)
      return;

    // Clean up previous instance
    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }

    const graph = new Graph!();

    // Add nodes
    for (const node of graphData.nodes) {
      graph.addNode(node.id, {
        label: node.content.slice(0, 40),
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 3 + node.importance * 12,
        color: TYPE_NODE_COLORS[node.memory_type] || "#94a3b8",
      });
    }

    // Add edges
    for (const edge of graphData.edges) {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        try {
          graph.addEdge(edge.source, edge.target, {
            size: 0.5 + edge.weight * 2,
            color: EDGE_TYPE_COLORS[edge.edge_type] || "#94a3b8",
            type: "line",
          });
        } catch {
          // Skip duplicate edges
        }
      }
    }

    // Apply ForceAtlas2 layout
    if (graph.order > 1) {
      forceAtlas2Fn.assign(graph, {
        iterations: 100,
        settings: {
          gravity: 1,
          scalingRatio: 10,
          barnesHutOptimize: graph.order > 200,
        },
      });
    }

    // Render with Sigma
    const renderer = new Sigma!(graph, containerRef.current, {
      renderEdgeLabels: false,
      defaultEdgeType: "line",
      labelRenderedSizeThreshold: 8,
    });

    renderer.on("clickNode", ({ node }) => {
      const found = graphData.nodes.find((n) => n.id === node);
      setSelectedNode(found || null);
    });

    renderer.on("clickStage", () => {
      setSelectedNode(null);
    });

    sigmaRef.current = renderer;

    return () => {
      renderer.kill();
      sigmaRef.current = null;
    };
  }, [graphData, libsLoaded]);

  const handleZoomIn = useCallback(() => {
    const camera = sigmaRef.current?.getCamera();
    if (camera) camera.animatedZoom({ duration: 200 });
  }, []);

  const handleZoomOut = useCallback(() => {
    const camera = sigmaRef.current?.getCamera();
    if (camera) camera.animatedUnzoom({ duration: 200 });
  }, []);

  const handleReset = useCallback(() => {
    const camera = sigmaRef.current?.getCamera();
    if (camera) camera.animatedReset({ duration: 300 });
  }, []);

  if (graphLoading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (graphError && !graphData) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] text-muted-foreground">
        <p className="text-sm font-medium text-destructive">Failed to load graph data</p>
        <p className="text-xs mt-1">{graphError}</p>
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] text-muted-foreground">
        <p className="text-sm">No graph data available</p>
        <p className="text-xs mt-1">Memories and edges will appear here once conversations generate facts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{graphData.nodes.length} nodes</span>
        <span>{graphData.edges.length} edges</span>
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_NODE_COLORS.episodic }} />
            <span className="text-xs">Episodic</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_NODE_COLORS.semantic }} />
            <span className="text-xs">Semantic</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_NODE_COLORS.procedural }} />
            <span className="text-xs">Procedural</span>
          </div>
        </div>
      </div>

      {/* Graph + Detail */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <div
            ref={containerRef}
            className="h-[500px] rounded-lg border bg-card"
          />
          {/* Zoom controls */}
          <div className="absolute top-3 right-3 flex flex-col gap-1">
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={handleZoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={handleZoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={handleReset}>
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Detail Panel */}
        {selectedNode && (
          <Card className="w-80 shrink-0">
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center justify-between">
                <MemoryTypeBadge type={selectedNode.memory_type} />
                <span className="text-xs text-muted-foreground capitalize">
                  {selectedNode.scope.replace("_", " ")}
                </span>
              </div>
              <p className="text-sm leading-relaxed">{selectedNode.content}</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Importance</p>
                  <p className="font-medium tabular-nums">
                    {Math.round(selectedNode.importance * 100)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Accesses</p>
                  <p className="font-medium tabular-nums">{selectedNode.access_count}</p>
                </div>
              </div>
              {selectedNode.entities.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Entities</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedNode.entities.map((e, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">
                        {e}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm">{new Date(selectedNode.created_at).toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
