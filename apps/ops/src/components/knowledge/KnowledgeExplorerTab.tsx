import { useEffect, useCallback, useMemo, useState } from "react";
import { FileText, Database, X, Eye, Clock } from "lucide-react";
import {
  Badge,
  Button,
  ResourceTable,
  Separator,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  relativeTime,
} from "@modularmind/ui";
import type { ResourceColumn, PaginationState } from "@modularmind/ui";
import { useKnowledgeStore } from "../../stores/knowledge";
import type { ExplorerChunk } from "../../stores/knowledge";

const PAGE_SIZE = 20;

function buildColumns(): ResourceColumn<ExplorerChunk>[] {
  return [
    {
      key: "filename",
      header: "Document",
      render: (chunk) => (
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm truncate" title={chunk.document_filename}>
            {chunk.document_filename}
          </span>
        </div>
      ),
    },
    {
      key: "chunk_index",
      header: "#",
      className: "w-[60px]",
      render: (chunk) => (
        <Badge variant="outline" className="text-xs px-1.5 py-0 tabular-nums">
          {chunk.chunk_index}
        </Badge>
      ),
    },
    {
      key: "collection",
      header: "Collection",
      className: "w-[140px]",
      render: (chunk) => (
        <span className="text-sm text-muted-foreground truncate" title={chunk.collection_name}>
          {chunk.collection_name}
        </span>
      ),
    },
    {
      key: "content",
      header: "Content",
      render: (chunk) => (
        <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap max-w-md">
          {chunk.content}
        </p>
      ),
    },
    {
      key: "accesses",
      header: "Accesses",
      className: "w-[90px]",
      render: (chunk) => (
        <span className="text-sm tabular-nums">{chunk.access_count}</span>
      ),
    },
    {
      key: "date",
      header: "Date",
      className: "w-[100px]",
      render: (chunk) => (
        <span className="text-sm text-muted-foreground">
          {relativeTime(chunk.created_at)}
        </span>
      ),
    },
  ];
}

function ChunkDetailSheet({ chunk, onClose }: { chunk: ExplorerChunk; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-[480px] max-w-full bg-background border-l flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <h3 className="text-sm font-semibold truncate">{chunk.document_filename}</h3>
              <Badge variant="outline" className="text-xs px-1.5 py-0 tabular-nums shrink-0">
                #{chunk.chunk_index}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{chunk.collection_name}</p>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Content
            </p>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{chunk.content}</p>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Metadata
            </p>
            <div className="space-y-2.5">
              <MetadataRow icon={Eye} label="Accesses" value={String(chunk.access_count)} />
              {chunk.last_accessed && (
                <MetadataRow icon={Clock} label="Last accessed" value={relativeTime(chunk.last_accessed)} />
              )}
              <MetadataRow icon={Clock} label="Created" value={relativeTime(chunk.created_at)} />
              <MetadataRow icon={Database} label="Collection" value={chunk.collection_name} />
              <MetadataRow icon={FileText} label="Document" value={chunk.document_filename} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetadataRow({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function ExplorerFilters() {
  const {
    explorerTotal, explorerFilters, setExplorerFilters,
    collections, documents, fetchCollections, fetchDocuments,
  } = useKnowledgeStore();

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const handleCollectionChange = useCallback((value: string) => {
    const collectionId = value === "all" ? "" : value;
    setExplorerFilters({ collection_id: collectionId, document_id: "" });
    if (collectionId) fetchDocuments(collectionId);
    setTimeout(() => useKnowledgeStore.getState().fetchExplorerChunks(1), 0);
  }, [setExplorerFilters, fetchDocuments]);

  const handleDocumentChange = useCallback((value: string) => {
    setExplorerFilters({ document_id: value === "all" ? "" : value });
    setTimeout(() => useKnowledgeStore.getState().fetchExplorerChunks(1), 0);
  }, [setExplorerFilters]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={explorerFilters.collection_id || "all"}
        onValueChange={handleCollectionChange}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="All Collections" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Collections</SelectItem>
          {collections.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {explorerFilters.collection_id && (
        <Select
          value={explorerFilters.document_id || "all"}
          onValueChange={handleDocumentChange}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Documents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Documents</SelectItem>
            {documents.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.filename}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
        {explorerTotal.toLocaleString()} chunks
      </span>
    </div>
  );
}

export function KnowledgeExplorerTab() {
  const {
    explorerChunks, explorerTotal, explorerPage, explorerLoading,
    fetchExplorerChunks,
  } = useKnowledgeStore();

  const [selectedChunk, setSelectedChunk] = useState<ExplorerChunk | null>(null);

  useEffect(() => {
    fetchExplorerChunks(1);
  }, [fetchExplorerChunks]);

  const columns = useMemo(() => buildColumns(), []);

  const pagination: PaginationState = {
    page: explorerPage,
    totalPages: Math.max(1, Math.ceil(explorerTotal / PAGE_SIZE)),
    totalItems: explorerTotal,
  };

  return (
    <div className="space-y-4">
      <ExplorerFilters />

      <ResourceTable<ExplorerChunk>
        items={explorerChunks}
        columns={columns}
        pagination={pagination}
        onPageChange={fetchExplorerChunks}
        onRowClick={setSelectedChunk}
        keyExtractor={(chunk) => chunk.id}
        isLoading={explorerLoading}
        emptyState={
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Database className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">No chunks found</p>
            <p className="text-xs mt-1">Upload documents to collections to see chunks here.</p>
          </div>
        }
      />

      {selectedChunk && (
        <ChunkDetailSheet chunk={selectedChunk} onClose={() => setSelectedChunk(null)} />
      )}
    </div>
  );
}
