import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import GraphNodeComponent from "./nodes/GraphNode";
import ExecutionEdge from "./edges/ExecutionEdge";
import { GraphToolbar } from "./GraphToolbar";
import { PropertiesPanel } from "./panels/PropertiesPanel";
import type { NodeType } from "./nodes/nodeConfig";
import type { Graph } from "@modularmind/api-client";

const nodeTypes: NodeTypes = {
  graphNode: GraphNodeComponent,
};

const edgeTypes: EdgeTypes = {
  execution: ExecutionEdge,
};

interface GraphCanvasProps {
  graph: Graph;
  onSave: (nodes: Node[], edges: Edge[]) => void;
  saving?: boolean;
}

function graphToFlow(graph: Graph): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = (graph.nodes || []).map((n, i) => ({
    id: n.id,
    type: "graphNode",
    position: n.position || { x: 250, y: i * 120 },
    data: {
      ...n.data,
      type: n.type,
      label: n.data?.label || n.id,
    },
  }));

  const edges: Edge[] = (graph.edges || []).map((e, i) => ({
    id: e.id || `edge-${i}`,
    source: e.source,
    target: e.target,
    type: "execution",
    data: (e.data as Record<string, unknown>) ?? undefined,
    sourceHandle: e.source_handle ?? undefined,
    targetHandle: e.target_handle ?? undefined,
  }));

  return { nodes, edges };
}

export function GraphCanvas({ graph, onSave }: GraphCanvasProps) {
  const initial = useMemo(() => graphToFlow(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const nodeIdCounter = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = () => onSave(nodes, edges);
    el.addEventListener("graph:save", handler);
    return () => el.removeEventListener("graph:save", handler);
  }, [onSave, nodes, edges]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.selected) ?? null,
    [nodes],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, type: "execution" }, eds));
    },
    [setEdges],
  );

  const handleAddNode = useCallback(
    (type: NodeType) => {
      nodeIdCounter.current += 1;
      const id = `${type}-${Date.now()}-${nodeIdCounter.current}`;
      const newNode: Node = {
        id,
        type: "graphNode",
        position: { x: 250, y: nodes.length * 120 },
        data: { type, label: type.charAt(0).toUpperCase() + type.slice(1) },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [nodes.length, setNodes],
  );

  const handleDeleteSelected = useCallback(() => {
    const selectedIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    if (selectedIds.size === 0) return;
    setNodes((nds) => nds.filter((n) => !selectedIds.has(n.id)));
    setEdges((eds) => eds.filter((e) => !selectedIds.has(e.source) && !selectedIds.has(e.target)));
  }, [nodes, setNodes, setEdges]);

  const handleUpdateNode = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data } : n)),
      );
    },
    [setNodes],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        handleDeleteSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        onSave(nodes, edges);
      }
    },
    [handleDeleteSelected, onSave, nodes, edges],
  );

  return (
    <div className="flex flex-col h-full" ref={containerRef} data-graph-canvas onKeyDown={handleKeyDown} tabIndex={0}>
      <GraphToolbar
        onAddNode={handleAddNode}
        onDeleteSelected={handleDeleteSelected}
        hasSelection={!!selectedNode}
        nodeCount={nodes.length}
      />

      <div className="flex flex-1 min-h-0">
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            snapToGrid
            snapGrid={[15, 15]}
            fitView
            deleteKeyCode={null}
          >
            <Background variant={BackgroundVariant.Dots} gap={15} size={1} />
            <Controls />
            <MiniMap
              nodeStrokeWidth={3}
              className="!bg-background/80 !border !border-border !rounded-lg"
            />
          </ReactFlow>
        </div>

        <div className="w-[280px] border-l border-border overflow-y-auto shrink-0">
          <div className="px-3 py-2 border-b border-border">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Properties
            </h3>
          </div>
          <PropertiesPanel node={selectedNode} onUpdateNode={handleUpdateNode} />
        </div>
      </div>
    </div>
  );
}
