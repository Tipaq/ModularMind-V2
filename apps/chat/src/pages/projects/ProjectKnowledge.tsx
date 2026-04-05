import { useCallback, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { FileText, Search, Trash2, Upload } from "lucide-react";
import { Badge, Button, ConfirmDialog, EmptyState, Input, relativeTime } from "@modularmind/ui";
import type { ProjectDetail } from "@modularmind/api-client";
import { useKnowledgeHub } from "../../hooks/useKnowledgeHub";
import type { KnowledgeDocumentWithSource } from "../../hooks/useKnowledgeHub";

interface ProjectContext {
  project: ProjectDetail;
  reload: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-success/10 text-success" },
  processing: { label: "Processing", className: "bg-warning/10 text-warning" },
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
};

export function ProjectKnowledge() {
  const { project } = useOutletContext<ProjectContext>();
  const {
    documents, totalDocuments, loading, uploading,
    search, setSearch, handleUpload, handleDelete,
  } = useKnowledgeHub({ projectId: project.id });

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
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">Knowledge</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Documents linked to this project.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!loading && (
            <Badge variant="outline" className="text-xs">{totalDocuments} documents</Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />
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
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={search ? "No documents match your search" : "No documents in this project"}
          description={search ? "Try a different search term." : "Upload documents to add knowledge to this project."}
        />
      ) : (
        <div className="rounded-xl border border-border/50 overflow-hidden">
          {documents.map((doc) => {
            const status = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.pending;
            return (
              <div
                key={doc.id}
                className="group flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors"
              >
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.filename}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Added {relativeTime(doc.created_at)}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs shrink-0 hidden sm:inline ${status.className}`}>
                  {status.label}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => setDeleteTarget(doc)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

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

export default ProjectKnowledge;
