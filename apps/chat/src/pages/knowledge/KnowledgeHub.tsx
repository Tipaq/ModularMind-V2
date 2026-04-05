import { useCallback, useRef } from "react";
import {
  FileText, FolderSync, Globe, Link2, Search, Trash2, Upload,
} from "lucide-react";
import { Badge, Button, EmptyState, Input, ConfirmDialog, relativeTime } from "@modularmind/ui";
import { useState } from "react";
import { useKnowledgeHub } from "../../hooks/useKnowledgeHub";
import type { KnowledgeDocumentWithSource } from "../../hooks/useKnowledgeHub";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-success/10 text-success" },
  processing: { label: "Processing", className: "bg-warning/10 text-warning" },
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
};

interface DataSourceCardProps {
  icon: React.ElementType;
  label: string;
  description: string;
  count?: number;
  isDisabled?: boolean;
}

function DataSourceCard({ icon: Icon, label, description, count, isDisabled }: DataSourceCardProps) {
  return (
    <div className={`rounded-xl border border-border/50 bg-card/50 p-4 ${isDisabled ? "opacity-50" : "cursor-pointer hover:bg-muted/30"} transition-colors`}>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4.5 w-4.5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {count !== undefined && (
          <Badge variant="outline" className="text-xs shrink-0">{count}</Badge>
        )}
        {isDisabled && (
          <Badge variant="secondary" className="text-[10px] shrink-0">Soon</Badge>
        )}
      </div>
    </div>
  );
}

function DocumentRow({
  document: doc,
  onDelete,
}: {
  document: KnowledgeDocumentWithSource;
  onDelete: (doc: KnowledgeDocumentWithSource) => void;
}) {
  const status = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.pending;

  return (
    <div className="group flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{doc.filename}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {doc.collection_name} &middot; Added {relativeTime(doc.created_at)}
        </p>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-xs shrink-0 hidden sm:inline ${status.className}`}>
        {status.label}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onDelete(doc)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function KnowledgeHub() {
  const {
    documents, totalDocuments, loading, uploading,
    search, setSearch, handleUpload, handleDelete,
  } = useKnowledgeHub();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDocumentWithSource | null>(null);

  const onFilesSelected = useCallback(
    (files: FileList | null) => { if (files) handleUpload(files); },
    [handleUpload],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await handleDelete(deleteTarget.id, deleteTarget.collection_id);
    setDeleteTarget(null);
  }, [deleteTarget, handleDelete]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Knowledge</h1>
          <p className="text-sm text-muted-foreground">Your documents and connected data sources</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading..." : "Upload"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onFilesSelected(e.target.files)}
        />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div>
        <h2 className="text-sm font-medium mb-3">Connected Data</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DataSourceCard
            icon={FolderSync}
            label="Folders"
            description="Sync local folders"
            isDisabled
          />
          <DataSourceCard
            icon={Globe}
            label="Websites"
            description="Crawl web content"
            isDisabled
          />
          <DataSourceCard
            icon={Link2}
            label="Connections"
            description="Drive, Notion, and more"
            isDisabled
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium">Documents</h2>
          {!loading && (
            <Badge variant="outline" className="text-xs">{totalDocuments} documents</Badge>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/50" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={search ? "No documents match your search" : "No documents yet"}
            description={search ? "Try a different search term." : "Upload documents to build your knowledge base."}
          />
        ) : (
          <div className="rounded-xl border border-border/50 overflow-hidden">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                document={doc}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      <div
        className="rounded-xl border-2 border-dashed border-border/50 p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
      >
        <Upload className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">
          {uploading ? "Uploading..." : "Drop files here or click to upload"}
        </p>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Delete "${deleteTarget?.filename}"?`}
        description="This document and its embeddings will be permanently deleted."
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export default KnowledgeHub;
