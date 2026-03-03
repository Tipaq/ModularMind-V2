export type NodeType = 'agent' | 'tool' | 'subgraph' | 'start' | 'end' | 'condition' | 'parallel' | 'merge' | 'loop' | 'supervisor';

export interface Position {
  x: number;
  y: number;
}

export interface NodeData {
  label: string;
  agent_id?: string | null;
  subgraph_id?: string | null;
  config?: Record<string, unknown>;
  executionStatus?: 'pending' | 'running' | 'completed' | 'failed' | null;
  executionDurationMs?: number | null;
  isCurrentNode?: boolean;
  isEntryNode?: boolean;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  position: Position;
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

export interface GraphSettings {
  memory_enabled: boolean;
  max_iterations: number;
  timeout_seconds: number;
}

export interface Graph {
  id: string;
  name: string;
  description: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  entry_node_id: string | null;
  settings: GraphSettings;
  version: number;
  created_at: string;
  updated_at: string | null;
}

export interface GraphListItem {
  id: string;
  name: string;
  description: string | null;
  node_count: number;
  edge_count: number;
  version: number;
  created_at: string;
  models: string[];
}

export interface GraphCreateInput {
  name: string;
  description?: string;
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  entry_node_id?: string;
  settings?: GraphSettings;
}

export interface GraphUpdateInput {
  name?: string;
  description?: string;
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  entry_node_id?: string;
  settings?: GraphSettings;
  change_note?: string;
}

import type { PaginatedResponse } from './common';
export type PaginatedGraphList = PaginatedResponse<GraphListItem>;

export interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
  node_id?: string | null;
  edge_id?: string | null;
}

export interface GraphValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}
