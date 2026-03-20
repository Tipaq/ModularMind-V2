"use client";

import { Badge, EmptyState } from "@modularmind/ui";
import type { ToolDefinition } from "@modularmind/api-client";
import { Wrench } from "lucide-react";

interface ToolsTableProps {
  tools: ToolDefinition[];
  loading: boolean;
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b last:border-0">
          {Array.from({ length: 3 }).map((_, j) => (
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
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Description</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <SkeletonRows /> : tools.map((tool) => (
            <ToolRow key={`${tool.category}:${tool.name}`} tool={tool} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
