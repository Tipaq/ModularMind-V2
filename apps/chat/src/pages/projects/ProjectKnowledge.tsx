import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { BookOpen, FileText } from "lucide-react";
import { Badge, EmptyState, relativeTime } from "@modularmind/ui";
import type { Collection, ProjectDetail } from "@modularmind/api-client";
import { api } from "../../lib/api";

interface ProjectContext {
  project: ProjectDetail;
}

export function ProjectKnowledge() {
  const { project } = useOutletContext<ProjectContext>();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCollections = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ items: Collection[] }>(
        `/rag/collections?project_id=${project.id}&page_size=100`,
      );
      setCollections(data.items ?? []);
    } catch {
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { loadCollections(); }, [loadCollections]);

  if (loading) {
    return (
      <div className="p-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/50" />
        ))}
      </div>
    );
  }

  if (collections.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <EmptyState
          icon={BookOpen}
          title="No knowledge collections in this project"
          description="Assign collections to this project from the Knowledge page."
        />
      </div>
    );
  }

  return (
    <div className="p-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {collections.map((col) => (
        <div key={col.id} className="rounded-xl border border-border/50 bg-card/50 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium truncate text-sm">{col.name}</h3>
            <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 shrink-0">
              <FileText className="h-3 w-3" />
              <span className="text-xs text-muted-foreground">{col.document_count}</span>
            </div>
          </div>
          {col.description && (
            <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{col.description}</p>
          )}
          <div className="mt-3 flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">{col.scope}</Badge>
            <Badge variant="outline" className="text-[10px]">{col.chunk_count} chunks</Badge>
          </div>
          {col.last_sync && (
            <p className="mt-2 text-[10px] text-muted-foreground">Updated {relativeTime(col.last_sync)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export default ProjectKnowledge;
