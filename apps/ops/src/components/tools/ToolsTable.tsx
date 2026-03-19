"use client";

import { Badge, EmptyState } from "@modularmind/ui";
import type { ToolDefinition } from "@modularmind/api-client";
import { Wrench } from "lucide-react";

const SOURCE_COLORS: Record<string, string> = {
  builtin: "bg-primary/15 text-primary",
  extended: "bg-info/15 text-info",
  gateway: "bg-warning/15 text-warning",
  mcp: "bg-success/15 text-success",
};

interface ToolsTableProps {
  tools: ToolDefinition[];
  loading: boolean;
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b last:border-0">
          {Array.from({ length: 4 }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function ToolRow({ tool }: { tool: ToolDefinition }) {
  return (
    <tr className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <span className="font-mono text-sm">{tool.name}</span>
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
          {tool.category}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${SOURCE_COLORS[tool.source] ?? ""}`}>
          {tool.source}
          {tool.server_name ? ` (${tool.server_name})` : ""}
        </span>
      </td>
      <td className="px-4 py-3 max-w-[400px]">
        <span className="text-sm text-muted-foreground line-clamp-2">
          {tool.description}
        </span>
      </td>
    </tr>
  );
}

export function ToolsTable({ tools, loading }: ToolsTableProps) {
  if (!loading && tools.length === 0) {
    return (
      <EmptyState
        icon={Wrench}
        title="No tools found"
        description="No tools match your current filters."
      />
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Category</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Source</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Description</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <SkeletonRows /> : tools.map((tool) => (
            <ToolRow key={`${tool.source}:${tool.name}`} tool={tool} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
