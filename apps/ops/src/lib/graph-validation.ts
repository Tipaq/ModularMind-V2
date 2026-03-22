import type { Node } from "@xyflow/react";
import type { ValidationIssue } from "@modularmind/api-client";

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
    const nodeType = node.data?.type as string;
    const label = (node.data?.label as string) || node.id;

    if (
      (nodeType === "agent" || nodeType === "supervisor") &&
      !node.data?.agent_id
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
