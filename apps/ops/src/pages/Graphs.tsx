import { GitFork, RefreshCw } from "lucide-react";
import type { GraphListItem } from "@modularmind/api-client";
import { PageHeader } from "../components/shared/PageHeader";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { relativeTime } from "@modularmind/ui";

export default function Graphs() {
  const { data, isLoading, refetch } = useApi<{ items: GraphListItem[] }>(
    () => api.get("/graphs"),
    [],
  );

  const graphs = data?.items ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        icon={GitFork}
        gradient="from-amber-500 to-orange-500"
        title="Graphs"
        description="Workflow graphs and execution pipelines"
        actions={
          <button
            onClick={refetch}
            className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm hover:bg-muted/80 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      ) : graphs.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-card/50 p-12 text-center">
          <GitFork className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-muted-foreground">No graphs configured</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {graphs.map((graph) => (
            <div
              key={graph.id}
              className="rounded-xl border border-border/50 bg-card/50 p-5 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-medium">{graph.name}</h3>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {graph.node_count} nodes
                </span>
              </div>
              {graph.description && (
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{graph.description}</p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Created {relativeTime(graph.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
