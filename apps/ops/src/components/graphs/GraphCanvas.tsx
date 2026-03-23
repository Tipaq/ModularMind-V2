import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  type NodeChange,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { GraphNode as GraphNodeComponent } from "./nodes/GraphNode";
import { ExecutionEdge } from "./edges/ExecutionEdge";
import { GraphToolbar } from "./GraphToolbar";
import { PropertiesPanel } from "./panels/PropertiesPanel";
import type { NodeType } from "./nodes/nodeConfig";
import type { Graph } from "@modularmind/api-client";
import type { ExecutionActivity } from "@modularmind/ui";

interface NodeExecutionState {
  nodeId: string;
  status: "running" | "completed" | "failed";
  durationMs?: number;
}

const nodeTypes: NodeTypes = {
  graphNode: GraphNodeComponent,
};

const edgeTypes: EdgeTypes = {
  execution: ExecutionEdge,
};

function activitiesToNodeStates(activities: ExecutionActivity[]): NodeExecutionState[] {
  const states: NodeExecutionState[] = [];
  for (const activity of activities) {
    if (activity.nodeId) {
      states.push({
        nodeId: activity.nodeId,
        status: activity.status,
        durationMs: activity.durationMs,
      });
    }
    if (activity.children) {
      states.push(...activitiesToNodeStates(activity.children));
    }
  }
  return states;
}

interface GraphCanvasProps {
  graph: Graph;
  onSave: (nodes: Node[], edges: Edge[]) => void;
  saving?: boolean;
  isEditMode?: boolean;
  onSelectionChange?: (node: Node | null) => void;
  onNodesEdgesChange?: (nodes: Node[], edges: Edge[]) => void;
  executionActivities?: ExecutionActivity[];
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

export function GraphCanvas({
  graph,
  onSave,
  isEditMode = true,
  onSelectionChange,
  onNodesEdgesChange,
  executionActivities = [],
}: GraphCanvasProps) {
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

  useEffect(() => {
    onSelectionChange?.(selectedNode);
  }, [selectedNode, onSelectionChange]);

  useEffect(() => {
    onNodesEdgesChange?.(nodes, edges);
  }, [nodes, edges, onNodesEdgesChange]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (isEditMode) {
        onNodesChange(changes);
      } else {
        const allowed = changes.filter(
          (c) => c.type === "select" || c.type === "dimensions",
        );
        if (allowed.length > 0) onNodesChange(allowed);
      }
    },
    [isEditMode, onNodesChange],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!isEditMode) return;
      setEdges((eds) => addEdge({ ...params, type: "execution" }, eds));
    },
    [setEdges, isEditMode],
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
    if (!isEditMode) return;
    const selectedIds = new Set(
      nodes.filter((n) => n.selected).map((n) => n.id),
    );
    if (selectedIds.size === 0) return;
    setNodes((nds) => nds.filter((n) => !selectedIds.has(n.id)));
    setEdges((eds) =>
      eds.filter(
        (e) => !selectedIds.has(e.source) && !selectedIds.has(e.target),
      ),
    );
  }, [nodes, setNodes, setEdges, isEditMode]);

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
      if (isEditMode && (e.key === "Delete" || e.key === "Backspace")) {
        handleDeleteSelected();
      }
      if (isEditMode && (e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        onSave(nodes, edges);
      }
    },
    [handleDeleteSelected, onSave, nodes, edges, isEditMode],
  );

  const nodeStates = useMemo(
    () => activitiesToNodeStates(executionActivities),
    [executionActivities],
  );

  const currentNodeId = useMemo(() => {
    const running = nodeStates.find((s) => s.status === "running");
    return running?.nodeId ?? null;
  }, [nodeStates]);

  const completedNodeIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of nodeStates) {
      if (s.status === "completed" || s.status === "failed") set.add(s.nodeId);
    }
    return set;
  }, [nodeStates]);

  const augmentedNodes = useMemo(() => {
    if (nodeStates.length === 0) return nodes;
    const stateMap = new Map(nodeStates.map((s) => [s.nodeId, s]));
    return nodes.map((node) => {
      const state = stateMap.get(node.id);
      if (!state) return node;
      return {
        ...node,
        data: {
          ...node.data,
          executionStatus: state.status,
          executionDurationMs: state.durationMs ?? null,
        },
      };
    });
  }, [nodes, nodeStates]);

  const augmentedEdges = useMemo(() => {
    if (nodeStates.length === 0) return edges;
    return edges.map((edge) => {
      let executionState = "idle";
      if (edge.target === currentNodeId || edge.source === currentNodeId) {
        executionState = "running";
      } else if (
        completedNodeIds.has(edge.source) &&
        completedNodeIds.has(edge.target)
      ) {
        const failed = nodeStates.find(
          (s) =>
            (s.nodeId === edge.source || s.nodeId === edge.target) &&
            s.status === "failed",
        );
        executionState = failed ? "failed" : "completed";
      }
      return {
        ...edge,
        data: { ...edge.data, status: executionState },
      };
    });
  }, [edges, currentNodeId, completedNodeIds, nodeStates]);

  return (
    <div
      className="flex flex-col h-full"
      ref={containerRef}
      data-graph-canvas
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <GraphToolbar
        onAddNode={handleAddNode}
        onDeleteSelected={handleDeleteSelected}
        hasSelection={!!selectedNode}
        nodeCount={nodes.length}
        isEditMode={isEditMode}
      />

      <div className="flex flex-1 min-h-0">
        <div className="flex-1">
          <ReactFlow
            nodes={augmentedNodes}
            edges={augmentedEdges}
            onNodesChange={handleNodesChange}
            onEdgesChange={isEditMode ? onEdgesChange : undefined}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            snapToGrid
            snapGrid={[15, 15]}
            fitView
            deleteKeyCode={null}
            nodesDraggable={isEditMode}
            nodesConnectable={isEditMode}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
          />
        </div>

        {selectedNode && (
          <div className="w-[280px] shrink-0 border-l border-border overflow-y-auto">
            <PropertiesPanel
              node={selectedNode}
              onUpdateNode={handleUpdateNode}
              isEditMode={isEditMode}
              executionActivities={executionActivities}
            />
          </div>
        )}
      </div>
    </div>
  );
}

