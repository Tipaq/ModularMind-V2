import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Loader2, ZoomIn, ZoomOut, Maximize2, MousePointerClick, User, Clock, Star, Eye, Tag, Layers, Link2 } from "lucide-react";
import { Button, Card, CardContent, Badge, Separator, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@modularmind/ui";
import { useMemoryStore, type GraphNode } from "../../stores/memory";
import { MemoryTypeBadge } from "./MemoryTypeBadge";

let Graph: typeof import("graphology").default | null = null;
let Sigma: typeof import("sigma").Sigma | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let noverlapFn: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let FA2LayoutWorkerCls: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fa2SyncFn: any = null;

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
    graphData, graphLoading, graphError, fetchGraphData,
    graphFilters, setGraphFilters,
    memoryUsers, fetchMemoryUsers,
  } = useMemoryStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<InstanceType<typeof import("sigma").Sigma> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fa2LayoutRef = useRef<any>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [libsLoaded, setLibsLoaded] = useState(false);

  // One stable color per user — derived from graph data, used in both the
  // renderer and the legend so they stay in sync.
  const USER_ANCHOR_PALETTE = ["#e879f9", "#fb923c", "#a78bfa", "#34d399", "#60a5fa", "#fbbf24"];
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
    fetchGraphData();
    loadGraphLibs().then(() => setLibsLoaded(true));
  }, [fetchGraphData, fetchMemoryUsers]);

  const handleFilterChange = useCallback((key: string, value: string) => {
    setGraphFilters({ [key]: value === "all" ? "" : value });
    setTimeout(() => useMemoryStore.getState().fetchGraphData(), 0);
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
    const anchorRadius = 80;
    uniqueUserIds.forEach((userId, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(uniqueUserIds.length, 1);
      const user = memoryUsers.find(u => u.user_id === userId);
      graph.addNode(`__anchor__${userId}`, {
        x: anchorRadius * Math.cos(angle),
        y: anchorRadius * Math.sin(angle),
        size: 18,
        color: userColorMap[userId],
        label: user?.email ?? `${userId.slice(0, 8)}…`,  // shown on hover
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
        size: 3 + node.importance * 12,
        color: (node.user_id && userColorMap[node.user_id]) ? userColorMap[node.user_id] : "#94a3b8",
        label: "",      // empty → sigma shows nothing on hover
        memType: node.memory_type,  // read by afterRender to pick the shape
      });
    }

    // ── 3. Real edges (same_tag, entity_overlap, …) ───────────────────────────
    const FA2_WEIGHTS: Record<string, number> = {
      same_tag: 3.0,
      entity_overlap: 2.0,
      same_category: 0.8,
      semantic_similarity: 1.2,
    };

    for (const edge of graphData.edges) {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        try {
          graph.addEdge(edge.source, edge.target, {
            size: 0.5 + edge.weight * 2,
            color: "#475569",
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
          color: "#94a3b8",
          type: "line",
          weight: 2.5,  // strong enough to cluster, weaker than same_tag
        });
      } catch { /* skip */ }
    }

    // ── 5. Initial noverlap pass — seed a clean starting position ────────────
    // Runs once synchronously so nodes don't pile up before the live sim starts.
    if (graph.order > 1) {
      noverlapFn.assign(graph, {
        maxIterations: 100,
        settings: { margin: 4, ratio: 1.2 },
      });
    }

    // ── 6. FA2 layout — worker for initial settle, sync for drag reactions ─────
    // Shared settings used by both the worker and synchronous FA2.
    const FA2_SETTINGS = {
      gravity: 1.0,
      scalingRatio: 12,
      adjustSizes: true,
      outboundAttractionDistribution: true,
      barnesHutOptimize: graph.order > 200,
      weightAttribute: "weight",
    };
    const fa2Layout = new FA2LayoutWorkerCls!(graph, { settings: FA2_SETTINGS });
    // Quick initial settle — stop automatically so the graph is static at rest.
    const FA2_SETTLE_MS = 250;
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
                  {u.email ?? u.user_id.slice(0, 8) + "…"} ({u.memory_count})
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
          <div className="absolute bottom-3 left-3 flex flex-col gap-1.5 bg-card/80 backdrop-blur-sm rounded-md px-3 py-2 border text-xs text-muted-foreground">
            {/* Types — shape only, color encodes user */}
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-muted-foreground/50" />
              <span>Episodic</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 bg-muted-foreground/50" />
              <span>Semantic</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0 text-muted-foreground/50">
                <polygon points="5,0 10,10 0,10" fill="currentColor" />
              </svg>
              <span>Procedural</span>
            </div>
            {Object.keys(userColorMap).length > 0 && (
              <>
                <Separator className="my-0" />
                {Object.entries(userColorMap).map(([userId, color]) => {
                  const u = memoryUsers.find(m => m.user_id === userId);
                  return (
                    <div key={userId} className="flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
                        <polygon points="6,1 10.2,3.5 10.2,8.5 6,11 1.8,8.5 1.8,3.5" fill={color} />
                      </svg>
                      <span className="truncate max-w-[110px]">
                        {u?.email ?? `${userId.slice(0, 8)}…`}
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>

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
        <Card className="w-72 shrink-0 h-[500px] overflow-y-auto">
          <CardContent className="pt-4 pb-4 space-y-0">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
              Node details
            </p>
            {selectedNode ? (
              <div className="space-y-4">
                {/* Type + Tier */}
                <div className="flex items-center justify-between gap-2">
                  <MemoryTypeBadge type={selectedNode.memory_type} />
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {selectedNode.tier}
                  </Badge>
                </div>

                {/* Content */}
                <p className="text-sm leading-relaxed text-foreground">
                  {selectedNode.content}
                </p>

                <Separator />

                {/* User */}
                <div className="flex items-start gap-2">
                  <User className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground mb-0.5">User</p>
                    {selectedNode.user_id ? (() => {
                      const u = memoryUsers.find((u) => u.user_id === selectedNode.user_id);
                      return u?.email ? (
                        <p className="text-xs font-medium truncate" title={selectedNode.user_id}>{u.email}</p>
                      ) : (
                        <p className="text-xs font-medium font-mono truncate" title={selectedNode.user_id}>
                          {selectedNode.user_id.slice(0, 8)}…
                        </p>
                      );
                    })() : (
                      <p className="text-xs text-muted-foreground italic">Global / no user</p>
                    )}
                  </div>
                </div>

                {/* Scope */}
                <div className="flex items-start gap-2">
                  <Layers className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Scope</p>
                    <p className="text-xs font-medium capitalize">{selectedNode.scope.replace("_", " ")}</p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate" title={selectedNode.scope_id}>
                      {selectedNode.scope_id}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-start gap-1.5">
                    <Star className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Importance</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {Math.round(selectedNode.importance * 100)}%
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Eye className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Accesses</p>
                      <p className="text-sm font-semibold tabular-nums">{selectedNode.access_count}</p>
                    </div>
                  </div>
                </div>

                {/* Tags */}
                {selectedNode.tags.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Tag className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground mb-1">Tags</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedNode.tags.map((t, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] border-orange-400/50 text-orange-600 dark:text-orange-400">
                            #{t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Entities */}
                {selectedNode.entities.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Tag className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground mb-1">Entities</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedNode.entities.map((e, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">
                            {e}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Connections */}
                {(() => {
                  const conns = graphData!.edges
                    .filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
                    .map(e => {
                      const neighborId = e.source === selectedNode.id ? e.target : e.source;
                      const neighbor = graphData!.nodes.find(n => n.id === neighborId);
                      return neighbor ? { node: neighbor, edge_type: e.edge_type } : null;
                    })
                    .filter((c): c is { node: GraphNode; edge_type: string } => c !== null);
                  if (!conns.length) return null;
                  return (
                    <>
                      <Separator />
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Link2 className="h-3 w-3" />
                          Connected to ({conns.length})
                        </p>
                        {conns.map(({ node, edge_type }, i) => (
                          <button key={i} className="w-full text-left" onClick={() => setSelectedNode(node)}>
                            <div className="rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors px-2.5 py-1.5 space-y-1">
                              <div className="flex items-center gap-1.5">
                                <MemoryTypeBadge type={node.memory_type} />
                                <Badge variant="outline" className="text-[9px] ml-auto capitalize">
                                  {edge_type.replace(/_/g, " ")}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                                {node.content}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  );
                })()}

                <Separator />

                {/* Dates */}
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Created</p>
                      <p className="text-xs">{new Date(selectedNode.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  {selectedNode.last_accessed && (
                    <div className="flex items-start gap-2">
                      <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Last accessed</p>
                        <p className="text-xs">{new Date(selectedNode.last_accessed).toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* ID */}
                <div className="pt-1">
                  <p className="text-[10px] text-muted-foreground/60 font-mono truncate" title={selectedNode.id}>
                    {selectedNode.id}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-52 gap-2 text-muted-foreground">
                <MousePointerClick className="h-5 w-5" />
                <p className="text-xs text-center">Click a node to see its details</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
