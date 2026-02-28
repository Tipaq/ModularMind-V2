import { BookOpen, RefreshCw, FileText } from "lucide-react";
import type { Collection } from "@modularmind/api-client";
import { PageHeader } from "../components/shared/PageHeader";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { relativeTime } from "@modularmind/ui";

export default function Knowledge() {
  const { data, isLoading, refetch } = useApi<Collection[]>(
    () => api.get("/rag/collections"),
    [],
  );

  const collections = data ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        icon={BookOpen}
        gradient="from-blue-500 to-indigo-500"
        title="Knowledge"
        description="RAG collections, documents, and memory"
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
      ) : collections.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-card/50 p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-muted-foreground">No collections created yet</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((col) => (
            <div
              key={col.id}
              className="rounded-xl border border-border/50 bg-card/50 p-5 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-medium">{col.name}</h3>
                <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5">
                  <FileText className="h-3 w-3" />
                  <span className="text-xs">{col.document_count}</span>
                </div>
              </div>
              {col.description && (
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{col.description}</p>
              )}
              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span>Chunk: {col.chunk_size}</span>
                <span>Overlap: {col.chunk_overlap}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Updated {relativeTime(col.updated_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
