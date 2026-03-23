import type { Node } from "@xyflow/react";
import type { ValidationIssue } from "@modularmind/api-client";

function resolveAgentId(data: Record<string, unknown>): string | null {
  const fromConfig = (data.config as Record<string, unknown> | undefined)
    ?.agentId as string | undefined;
  if (fromConfig) return fromConfig;
  if (data.agent_id) return data.agent_id as string;
  return null;
}

export function validateGraph(
  nodes: Node[],
  entryNodeId: string | null,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (nodes.length === 0) {
    issues.push({ type: "error", message: "Graph has no nodes" });
    return issues;
  }

  if (!entryNodeId) {
    issues.push({ type: "error", message: "No entry node selected" });
  } else if (!nodes.some((n) => n.id === entryNodeId)) {
    issues.push({
      type: "error",
      message: "Entry node does not exist",
      node_id: entryNodeId,
    });
  }

  for (const node of nodes) {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const nodeType = data.type as string;
    const label = (data.label as string) || node.id;

    if (
      (nodeType === "agent" || nodeType === "supervisor") &&
      !resolveAgentId(data)
    ) {
      issues.push({
        type: "warning",
        message: `"${label}" has no agent assigned`,
        node_id: node.id,
      });
    }

    if (nodeType === "subgraph" && !node.data?.subgraph_id) {
      issues.push({
        type: "warning",
        message: `"${label}" has no subgraph assigned`,
        node_id: node.id,
      });
    }

    if (nodeType === "condition" && !node.data?.condition) {
      issues.push({
        type: "warning",
        message: `"${label}" has no condition expression`,
        node_id: node.id,
      });
    }
  }

  return issues;
}
