import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@modularmind/ui";
import { useKnowledgeStore } from "../../stores/knowledge";

let Graph: typeof import("graphology").default | null = null;
let Sigma: typeof import("sigma").Sigma | null = null;
let noverlapFn: typeof import("graphology-layout-noverlap").default | null = null;

// ── Canvas colors (hex required for Sigma/WebGL) ────────────────────────────
const COLOR_COLLECTION = "#60a5fa";   // blue-400
const COLOR_DOC_READY = "#34d399";    // emerald-400
const COLOR_DOC_PROCESSING = "#fbbf24"; // amber-400
const COLOR_DOC_FAILED = "#f87171";   // red-400
const COLOR_DOC_DEFAULT = "#94a3b8";  // slate-400
const COLOR_EDGE = "#475569";         // slate-600

const ZOOM_DURATION_MS = 200;
const RESET_DURATION_MS = 300;
const NOVERLAP_MAX_ITERATIONS = 100;

function docColor(status?: string): string {
  switch (status) {
    case "ready": return COLOR_DOC_READY;
    case "processing": return COLOR_DOC_PROCESSING;
    case "failed": return COLOR_DOC_FAILED;
    default: return COLOR_DOC_DEFAULT;
  }
}

async function loadGraphLibs() {
  if (Graph && Sigma && noverlapFn) return;
  const [graphModule, sigmaModule, noverlapModule] = await Promise.all([
    import("graphology"),
    import("sigma"),
    import("graphology-layout-noverlap"),
  ]);
  Graph = graphModule.default;
  Sigma = sigmaModule.Sigma;
  noverlapFn = noverlapModule.default;
}

export function KnowledgeGraphTab() {
  const { graphData, graphLoading, graphError, fetchGraphData } = useKnowledgeStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<InstanceType<typeof import("sigma").Sigma> | null>(null);
  const [libsLoaded, setLibsLoaded] = useState(false);
  const [selectedNode, setSelectedNode] = useState<{ id: string; label: string; node_type: string; chunk_count: number } | null>(null);

  useEffect(() => {
    fetchGraphData();
    loadGraphLibs().then(() => setLibsLoaded(true));
  }, [fetchGraphData]);

  // Render graph
  useEffect(() => {
    if (!graphData || !libsLoaded || !containerRef.current || !Graph || !Sigma || !noverlapFn)
      return;

    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }

    const graph = new Graph!();

    // Add nodes
    for (const node of graphData.nodes) {
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const isCollection = node.node_type === "collection";
      graph.addNode(node.id, {
        x,
        y,
        size: node.size,
        color: isCollection ? COLOR_COLLECTION : docColor(node.status),
        label: node.label,
      });
    }

    // Add edges
    for (const edge of graphData.edges) {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        try {
          graph.addEdge(edge.source, edge.target, {
            size: 0.5 + edge.weight,
            color: COLOR_EDGE,
            type: "line",
          });
        } catch { /* skip duplicates */ }
      }
    }

    // Layout
    if (graph.order > 1) {
      noverlapFn.assign(graph, {
        maxIterations: NOVERLAP_MAX_ITERATIONS,
        settings: { margin: 6, ratio: 1.5 },
      });
    }

    const renderer = new Sigma!(graph, containerRef.current, {
      renderLabels: true,
      renderEdgeLabels: false,
      defaultEdgeType: "line",
      labelRenderedSizeThreshold: 6,
    });

    renderer.on("clickNode", ({ node }) => {
      const found = graphData.nodes.find((n) => n.id === node);
      setSelectedNode(found ? { id: found.id, label: found.label, node_type: found.node_type, chunk_count: found.chunk_count } : null);
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
    sigmaRef.current?.getCamera().animatedZoom({ duration: ZOOM_DURATION_MS });
  }, []);

  const handleZoomOut = useCallback(() => {
    sigmaRef.current?.getCamera().animatedUnzoom({ duration: ZOOM_DURATION_MS });
  }, []);

  const handleReset = useCallback(() => {
    sigmaRef.current?.getCamera().animatedReset({ duration: RESET_DURATION_MS });
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
        <p className="text-xs mt-1">Collections and documents will appear here once created.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#60a5fa]" />
          Collection
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
          Ready
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]" />
          Processing
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#f87171]" />
          Failed
        </span>
        <span className="ml-auto">
          {graphData.nodes.length} nodes · {graphData.edges.length} edges
        </span>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 relative">
          <div
            ref={containerRef}
            className="h-[500px] rounded-lg border bg-card relative"
          />
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

        {/* Detail panel */}
        <div className="w-64 shrink-0">
          {selectedNode ? (
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <p className="text-sm font-medium truncate">{selectedNode.label}</p>
              <p className="text-xs text-muted-foreground capitalize">{selectedNode.node_type}</p>
              <p className="text-xs text-muted-foreground">{selectedNode.chunk_count} chunks</p>
            </div>
          ) : (
            <div className="rounded-lg border bg-card/50 p-4 text-center">
              <p className="text-xs text-muted-foreground">Click a node for details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
