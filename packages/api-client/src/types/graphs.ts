import type { PaginatedResponse } from "./common";

// ─── Node & Edge types ──────────────────────────────────────────────────────

export type NodeType =
  | "agent"
  | "tool"
  | "subgraph"
  | "start"
  | "end"
  | "condition"
  | "parallel"
  | "merge"
  | "loop"
  | "supervisor";

export interface Position {
  x: number;
  y: number;
}

export interface NodeData {
  label: string;
  agent_id?: string | null;
  subgraph_id?: string | null;
  config?: Record<string, unknown>;
  position?: Position;
  executionStatus?: "pending" | "running" | "completed" | "failed" | null;
  executionDurationMs?: number | null;
  isCurrentNode?: boolean;
  isEntryNode?: boolean;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  position?: Position | null;
  data: NodeData;
}

export interface EdgeData {
  label?: string;
  condition?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  source_handle?: string | null;
  target_handle?: string | null;
  data?: EdgeData | null;
}

// ─── Graph (matches Engine GraphDetail) ─────────────────────────────────────

export interface Graph {
  id: string;
  name: string;
  description: string;
  version: number;
  timeout_seconds: number;
  node_count: number;
  edge_count: number;
  entry_node_id: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  models: string[];
  config_version: number | null;
  config_hash: string | null;
}

export interface GraphListItem {
  id: string;
  name: string;
  description: string;
  node_count: number;
  edge_count: number;
  version: number;
  models: string[];
  timeout_seconds: number;
}

export type PaginatedGraphList = PaginatedResponse<GraphListItem>;

// ─── Create / Update ────────────────────────────────────────────────────────

export interface NodeInput {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface EdgeInput {
  id?: string;
  source: string;
  target: string;
  data?: Record<string, unknown>;
}

export interface GraphCreateInput {
  name: string;
  description?: string;
  nodes?: NodeInput[];
  edges?: EdgeInput[];
  timeout_seconds?: number;
  entry_node_id?: string;
}

export interface GraphUpdateInput {
  name?: string;
  description?: string;
  nodes?: NodeInput[];
  edges?: EdgeInput[];
  timeout_seconds?: number;
  entry_node_id?: string;
  change_note?: string;
}

// ─── Validation ─────────────────────────────────────────────────────────────

export interface ValidationIssue {
  type: "error" | "warning";
  message: string;
  node_id?: string | null;
  edge_id?: string | null;
}

export interface GraphValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}
