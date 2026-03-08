import { useEffect, useCallback } from "react";
import { FileText, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@modularmind/ui";
import { useKnowledgeStore } from "../../stores/knowledge";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function KnowledgeExplorerTab() {
  const {
    explorerChunks, explorerTotal, explorerPage, explorerLoading,
    explorerFilters, setExplorerFilters, fetchExplorerChunks,
    collections, fetchCollections,
  } = useKnowledgeStore();

  useEffect(() => {
    fetchCollections();
    fetchExplorerChunks(1);
  }, [fetchCollections, fetchExplorerChunks]);

  const handleFilterChange = useCallback(
    (key: string, value: string) => {
      setExplorerFilters({ [key]: value === "all" ? "" : value });
      setTimeout(() => useKnowledgeStore.getState().fetchExplorerChunks(1), 0);
    },
    [setExplorerFilters],
  );

  const totalPages = Math.max(1, Math.ceil(explorerTotal / 20));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={explorerFilters.collection_id || "all"}
          onValueChange={(v) => handleFilterChange("collection_id", v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Collections" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Collections</SelectItem>
            {collections.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto text-xs text-muted-foreground">
          {explorerTotal.toLocaleString()} chunks
        </span>
      </div>

      {/* Loading */}
      {explorerLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Chunk list */}
      {!explorerLoading && explorerChunks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileText className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm font-medium">No chunks found</p>
          <p className="text-xs mt-1">Upload documents to collections to see chunks here.</p>
        </div>
      )}

      {!explorerLoading && explorerChunks.length > 0 && (
        <div className="space-y-2">
          {explorerChunks.map((chunk) => (
            <Card key={chunk.id} className="overflow-hidden">
              <CardContent className="py-3 px-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium truncate">
                    {chunk.document_filename}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                    #{chunk.chunk_index}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                    {chunk.collection_name}
                  </span>
                </div>
                <p className="text-[11px] text-foreground/80 line-clamp-3 whitespace-pre-wrap">
                  {chunk.content}
                </p>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>{chunk.access_count} accesses</span>
                  {chunk.last_accessed && (
                    <span>last: {timeAgo(chunk.last_accessed)}</span>
                  )}
                  <span className="ml-auto">{timeAgo(chunk.created_at)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {explorerTotal > 20 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={explorerPage <= 1}
            onClick={() => fetchExplorerChunks(explorerPage - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {explorerPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={explorerPage >= totalPages}
            onClick={() => fetchExplorerChunks(explorerPage + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
