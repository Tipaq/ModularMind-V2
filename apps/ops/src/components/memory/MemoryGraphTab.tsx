import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Loader2, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@modularmind/ui";
import { useMemoryStore, type MemoryGraphNode } from "../../stores/memory";
import { GraphNodeDetail } from "./GraphNodeDetail";
import { GraphLegend } from "./GraphLegend";

let Graph: typeof import("graphology").default | null = null;
let Sigma: typeof import("sigma").Sigma | null = null;
let noverlapFn: typeof import("graphology-layout-noverlap").default | null = null;
let FA2LayoutWorkerCls: typeof import("graphology-layout-forceatlas2/worker").default | null = null;
let fa2SyncFn: typeof import("graphology-layout-forceatlas2").default | null = null;

// ── Canvas colors (hex required for Sigma/WebGL rendering) ───────────────────
const USER_ANCHOR_PALETTE = ["#e879f9", "#fb923c", "#a78bfa", "#34d399", "#60a5fa", "#fbbf24"];
const COLOR_NODE_DEFAULT = "#94a3b8";   // slate-400 — unassigned nodes
const COLOR_EDGE_DEFAULT = "#475569";   // slate-600 — edge lines
const COLOR_EDGE_ANCHOR = "#94a3b8";    // slate-400 — anchor gravity edges

// ── Layout constants ─────────────────────────────────────────────────────────
const ANCHOR_RADIUS = 80;
const ANCHOR_NODE_SIZE = 18;
const NODE_BASE_SIZE = 3;
const NODE_IMPORTANCE_SCALE = 12;
const FA2_SETTLE_MS = 250;
const NOVERLAP_MAX_ITERATIONS = 100;
const FA2_SCALING_RATIO = 12;
const ZOOM_DURATION_MS = 200;
const RESET_DURATION_MS = 300;
const USER_ID_DISPLAY_LENGTH = 8;

const FA2_WEIGHTS: Record<string, number> = {
  same_tag: 3.0,
  entity_overlap: 2.0,
  same_category: 0.8,
  semantic_similarity: 1.2,
};

async function loadGraphLibs() {
  if (Graph && Sigma && noverlapFn && FA2LayoutWorkerCls && fa2SyncFn) return;
  const [graphModule, sigmaModule, noverlapModule, fa2WorkerModule, fa2SyncModule] = await Promise.all([
    import("graphology"),
    import("sigma"),
    import("graphology-layout-noverlap"),
    import("graphology-layout-forceatlas2/worker"),
    import("graphology-layout-forceatlas2"),
  ]);
  Graph = graphModule.default;
  Sigma = sigmaModule.Sigma;
  noverlapFn = noverlapModule.default;
  FA2LayoutWorkerCls = fa2WorkerModule.default;
  fa2SyncFn = fa2SyncModule.default;
}



export function MemoryGraphTab() {
  const {
    graphData, graphLoading, graphError, fetchMemoryGraphData,
    graphFilters, setGraphFilters,
    memoryUsers, fetchMemoryUsers,
  } = useMemoryStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<InstanceType<typeof import("sigma").Sigma> | null>(null);
  const fa2LayoutRef = useRef<InstanceType<NonNullable<typeof FA2LayoutWorkerCls>> | null>(null);
  const [selectedNode, setSelectedNode] = useState<MemoryGraphNode | null>(null);
  const [libsLoaded, setLibsLoaded] = useState(false);

  const userColorMap = useMemo(() => {
    if (!graphData) return {} as Record<string, string>;
    const uniqueIds = [...new Set(
      graphData.nodes.map(n => n.user_id).filter((id): id is string => id !== null)
    )];
    const map: Record<string, string> = {};
    uniqueIds.forEach((id, idx) => { map[id] = USER_ANCHOR_PALETTE[idx % USER_ANCHOR_PALETTE.length]; });
    return map;
  }, [graphData]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchMemoryUsers();
    fetchMemoryGraphData();
    loadGraphLibs().then(() => setLibsLoaded(true));
  }, [fetchMemoryGraphData, fetchMemoryUsers]);

  const handleFilterChange = useCallback((key: string, value: string) => {
    setGraphFilters({ [key]: value === "all" ? "" : value });
    setTimeout(() => useMemoryStore.getState().fetchMemoryGraphData(), 0);
  }, [setGraphFilters]);

  // Render graph when both data and libs are ready
  useEffect(() => {
    if (!graphData || !libsLoaded || !containerRef.current || !Graph || !Sigma || !noverlapFn || !FA2LayoutWorkerCls)
      return;

    // Clean up previous instances
    if (fa2LayoutRef.current) {
      fa2LayoutRef.current.stop();
      fa2LayoutRef.current.kill();
      fa2LayoutRef.current = null;
    }
    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }

    const graph = new Graph!();

    // ── 1. Virtual user anchor nodes ──────────────────────────────────────────
    // One anchor per unique user_id, spread evenly on a circle.
    // These are frontend-only — not stored in the DB, no cross-user edges.
    const uniqueUserIds = Object.keys(userColorMap);
    uniqueUserIds.forEach((userId, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(uniqueUserIds.length, 1);
      const user = memoryUsers.find(u => u.user_id === userId);
      graph.addNode(`__anchor__${userId}`, {
        x: ANCHOR_RADIUS * Math.cos(angle),
        y: ANCHOR_RADIUS * Math.sin(angle),
        size: ANCHOR_NODE_SIZE,
        color: userColorMap[userId],
        label: user?.email ?? `${userId.slice(0, USER_ID_DISPLAY_LENGTH)}…`,
      });
    });

    // ── 2. Memory nodes, seeded near their user's anchor ──────────────────────
    for (const node of graphData.nodes) {
      let x = Math.random() * 100;
      let y = Math.random() * 100;
      const anchorId = node.user_id ? `__anchor__${node.user_id}` : null;
      if (anchorId && graph.hasNode(anchorId)) {
        const a = graph.getNodeAttributes(anchorId);
        x = a.x + (Math.random() - 0.5) * 30;
        y = a.y + (Math.random() - 0.5) * 30;
      }
      graph.addNode(node.id, {
        x,
        y,
        size: NODE_BASE_SIZE + node.importance * NODE_IMPORTANCE_SCALE,
        color: (node.user_id && userColorMap[node.user_id]) ? userColorMap[node.user_id] : COLOR_NODE_DEFAULT,
        label: "",      // empty → sigma shows nothing on hover
        memType: node.memory_type,  // read by afterRender to pick the shape
      });
    }

    // ── 3. Real edges (same_tag, entity_overlap, …) ───────────────────────────
    for (const edge of graphData.edges) {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        try {
          graph.addEdge(edge.source, edge.target, {
            size: 0.5 + edge.weight * 2,
            color: COLOR_EDGE_DEFAULT,
            type: "line",
            weight: FA2_WEIGHTS[edge.edge_type] ?? 1.0,
          });
        } catch {
          // Skip duplicate edges
        }
      }
    }

    // ── 4. Virtual anchor edges (layout-only gravity pulls) ───────────────────
    // Each memory node is weakly attracted to its user's anchor. These edges
    // are purely for FA2 layout — they are never stored in the DB.
    for (const node of graphData.nodes) {
      if (!node.user_id) continue;
      const anchorId = `__anchor__${node.user_id}`;
      if (!graph.hasNode(anchorId)) continue;
      try {
        graph.addEdge(node.id, anchorId, {
          size: 0.3,
          color: COLOR_EDGE_ANCHOR,
          type: "line",
          weight: 2.5,  // strong enough to cluster, weaker than same_tag
        });
      } catch { /* skip */ }
    }

    // ── 5. Initial noverlap pass — seed a clean starting position ────────────
    // Runs once synchronously so nodes don't pile up before the live sim starts.
    if (graph.order > 1) {
      noverlapFn.assign(graph, {
        maxIterations: NOVERLAP_MAX_ITERATIONS,
        settings: { margin: 4, ratio: 1.2 },
      });
    }

    // ── 6. FA2 layout — worker for initial settle, sync for drag reactions ─────
    // Shared settings used by both the worker and synchronous FA2.
    const FA2_SETTINGS = {
      gravity: 1.0,
      scalingRatio: FA2_SCALING_RATIO,
      adjustSizes: true,
      outboundAttractionDistribution: true,
      barnesHutOptimize: graph.order > 200,
      weightAttribute: "weight",
    };
    const fa2Layout = new FA2LayoutWorkerCls!(graph, { settings: FA2_SETTINGS });
    let fa2Timer: ReturnType<typeof setTimeout> | null = null;
    const restartAndSettle = () => {
      fa2Layout.start();
      if (fa2Timer) clearTimeout(fa2Timer);
      fa2Timer = setTimeout(() => fa2Layout.stop(), FA2_SETTLE_MS);
    };
    restartAndSettle();
    fa2LayoutRef.current = fa2Layout;

    // ── 7. Render with Sigma ──────────────────────────────────────────────────
    const renderer = new Sigma!(graph, containerRef.current, {
      renderLabels: false,      // no text — shapes drawn on overlay canvas below
      renderEdgeLabels: false,
      defaultEdgeType: "line",
    });

    // ── Overlay canvas for geometric shapes ───────────────────────────────────
    // Sigma renders WebGL circles for all nodes. We draw 2D geometric shapes on
    // a transparent overlay canvas on top: square (semantic), triangle (procedural),
    // circle (episodic). Uses sigma.getNodeDisplayData() for viewport coordinates.
    const shapeCanvas = document.createElement("canvas");
    shapeCanvas.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;";
    const dpr = window.devicePixelRatio || 1;
    shapeCanvas.width = containerRef.current.offsetWidth * dpr;
    shapeCanvas.height = containerRef.current.offsetHeight * dpr;
    shapeCanvas.style.width = containerRef.current.offsetWidth + "px";
    shapeCanvas.style.height = containerRef.current.offsetHeight + "px";
    containerRef.current.appendChild(shapeCanvas);
    const shapeCtx = shapeCanvas.getContext("2d")!;
    shapeCtx.scale(dpr, dpr);

    renderer.on("afterRender", () => {
      shapeCtx.clearRect(0, 0, containerRef.current!.offsetWidth, containerRef.current!.offsetHeight);
      const cameraRatio = renderer.getCamera().ratio;
      graph.forEachNode((nodeId, attrs) => {
        if (attrs.hidden) return;
        const { x, y } = renderer.graphToViewport({ x: attrs.x as number, y: attrs.y as number });
        const size = (attrs.size as number) / cameraRatio;
        if (size < 1) return;
        shapeCtx.fillStyle = attrs.color as string;

        if (nodeId.startsWith("__anchor__")) {
          // Hexagon — visually distinct "hub" shape for user anchor nodes
          const r = size * 1.1;
          shapeCtx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI * 2) / 6 - Math.PI / 6;
            const hx = x + r * Math.cos(a);
            const hy = y + r * Math.sin(a);
            if (i === 0) shapeCtx.moveTo(hx, hy); else shapeCtx.lineTo(hx, hy);
          }
          shapeCtx.closePath();
          shapeCtx.fill();
        } else {
          const memType = attrs.memType as string;
          if (!memType) return;
          if (memType === "semantic") {
            shapeCtx.fillRect(x - size, y - size, size * 2, size * 2);
          } else if (memType === "procedural") {
            shapeCtx.beginPath();
            shapeCtx.moveTo(x, y - size * 1.2);
            shapeCtx.lineTo(x + size * 1.05, y + size * 0.6);
            shapeCtx.lineTo(x - size * 1.05, y + size * 0.6);
            shapeCtx.closePath();
            shapeCtx.fill();
          }
          // episodic: WebGL circle is sufficient
        }
      });
    });

    // ── 8. Drag — Obsidian-style interactive physics ──────────────────────────
    // The FA2 worker has its own internal position buffer and doesn't re-read
    // graphology attributes mid-run. To get real-time neighbor reactions during
    // drag we stop the worker and use the synchronous FA2 (a few iterations per
    // animation frame) so neighbors respond instantly to the cursor position.
    let draggedNode: string | null = null;
    let hasDragged = false;
    let dragRafId: number | null = null;
    let latestDragPos = { x: 0, y: 0 };

    renderer.on("downNode", ({ node }) => {
      draggedNode = node;
      hasDragged = false;
      if (fa2Timer) clearTimeout(fa2Timer);
      fa2Layout.stop(); // hand off to sync FA2 for drag
      graph.setNodeAttribute(node, "fixed", true);
      renderer.getCamera().disable();
    });

    renderer.getMouseCaptor().on("mousemovebody", (e) => {
      if (!draggedNode) return;
      hasDragged = true;
      const pos = renderer.viewportToGraph(e);
      latestDragPos = pos;
      graph.setNodeAttribute(draggedNode, "x", pos.x);
      graph.setNodeAttribute(draggedNode, "y", pos.y);
      e.preventSigmaDefault?.();

      // Run a few sync FA2 iterations each frame — neighbors react to the
      // dragged node's new position in real-time without any worker latency.
      if (dragRafId) cancelAnimationFrame(dragRafId);
      dragRafId = requestAnimationFrame(() => {
        if (!draggedNode) return;
        fa2SyncFn?.assign(graph, { iterations: 20, settings: FA2_SETTINGS });
        // Guarantee the dragged node stays exactly at the cursor (sync FA2
        // respects fixed:true but this is belt-and-suspenders).
        graph.setNodeAttribute(draggedNode, "x", latestDragPos.x);
        graph.setNodeAttribute(draggedNode, "y", latestDragPos.y);
        dragRafId = null;
      });
    });

    renderer.getMouseCaptor().on("mouseup", () => {
      if (dragRafId) { cancelAnimationFrame(dragRafId); dragRafId = null; }
      if (draggedNode) {
        // Keep fixed: true — node stays pinned where dropped (Obsidian behavior).
        // FA2 only moves the non-pinned nodes when it restarts.
        draggedNode = null;
        restartAndSettle(); // re-settle free neighbors around the pinned node
      }
      renderer.getCamera().enable();
    });

    renderer.on("clickNode", ({ node }) => {
      if (hasDragged) { hasDragged = false; return; }
      if (node.startsWith("__anchor__")) return; // anchors: draggable but not selectable
      const found = graphData.nodes.find((n) => n.id === node);
      setSelectedNode(found || null);
    });

    renderer.on("clickStage", () => {
      setSelectedNode(null);
    });

    sigmaRef.current = renderer;

    return () => {
      if (fa2Timer) clearTimeout(fa2Timer);
      if (dragRafId) cancelAnimationFrame(dragRafId);
      fa2Layout.stop();
      fa2Layout.kill();
      fa2LayoutRef.current = null;
      renderer.kill();
      sigmaRef.current = null;
      shapeCanvas.remove();
    };
  }, [graphData, libsLoaded, userColorMap, memoryUsers]);

  const handleZoomIn = useCallback(() => {
    const camera = sigmaRef.current?.getCamera();
    if (camera) camera.animatedZoom({ duration: ZOOM_DURATION_MS });
  }, []);

  const handleZoomOut = useCallback(() => {
    const camera = sigmaRef.current?.getCamera();
    if (camera) camera.animatedUnzoom({ duration: ZOOM_DURATION_MS });
  }, []);

  const handleReset = useCallback(() => {
    const camera = sigmaRef.current?.getCamera();
    if (camera) camera.animatedReset({ duration: RESET_DURATION_MS });
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
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={graphFilters.scope || "all"}
          onValueChange={(v) => handleFilterChange("scope", v)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Scopes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scopes</SelectItem>
            <SelectItem value="user_profile">User Profile</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="cross_conversation">Cross Conv.</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={graphFilters.memory_type || "all"}
          onValueChange={(v) => handleFilterChange("memory_type", v)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="episodic">Episodic</SelectItem>
            <SelectItem value="semantic">Semantic</SelectItem>
            <SelectItem value="procedural">Procedural</SelectItem>
          </SelectContent>
        </Select>

        {memoryUsers.length > 0 && (
          <Select
            value={graphFilters.user_id || "all"}
            onValueChange={(v) => handleFilterChange("user_id", v)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {memoryUsers.map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {u.email ?? u.user_id.slice(0, USER_ID_DISPLAY_LENGTH) + "…"} ({u.memory_count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {graphData.nodes.length} nodes · {graphData.edges.length} edges
        </span>
      </div>

      {/* Graph + Detail */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <div
            ref={containerRef}
            className="h-[500px] rounded-lg border bg-card relative"
          />
          {/* Legend */}
          <GraphLegend userColorMap={userColorMap} memoryUsers={memoryUsers} />

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

        {/* Detail Panel — always visible */}
        <GraphNodeDetail
          selectedNode={selectedNode}
          graphData={graphData}
          memoryUsers={memoryUsers}
          setSelectedNode={setSelectedNode}
        />
      </div>
    </div>
  );
}
