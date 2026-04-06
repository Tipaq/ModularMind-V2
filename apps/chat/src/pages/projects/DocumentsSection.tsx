import { useRef, useState, useCallback } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { Badge, Button, ConfirmDialog, relativeTime } from "@modularmind/ui";
import type { KnowledgeDocumentWithSource } from "../../hooks/useKnowledgeHub";

const DOC_STATUS: Record<string, { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-success/10 text-success" },
  processing: { label: "Processing", className: "bg-warning/10 text-warning" },
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
};

interface DocumentsSectionProps {
  documents: KnowledgeDocumentWithSource[];
  totalDocuments: number;
  loading: boolean;
  uploading: boolean;
  onUpload: (files: FileList) => void;
  onDelete: (docId: string, collectionId: string) => Promise<void>;
}

export function DocumentsSection({
  documents,
  totalDocuments,
  loading,
  uploading,
  onUpload,
  onDelete,
}: DocumentsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDocumentWithSource | null>(null);

  const onFilesSelected = useCallback(
    (files: FileList | null) => { if (files) onUpload(files); },
    [onUpload],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await onDelete(deleteTarget.id, deleteTarget.collection_id);
    setDeleteTarget(null);
  }, [deleteTarget, onDelete]);

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Documents</h3>
          </div>
          {!loading && (
            <Badge variant="outline" className="text-xs">{totalDocuments} documents</Badge>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/50" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No documents yet.</p>
        ) : (
          <div className="rounded-xl border border-border/50 overflow-hidden">
            {documents.map((doc) => {
              const status = DOC_STATUS[doc.status] ?? DOC_STATUS.pending;
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

        <div
          className="mt-3 rounded-xl border-2 border-dashed border-border/50 p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
        >
          <Upload className="mx-auto h-6 w-6 text-muted-foreground/50" />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {uploading ? "Uploading..." : "Drop files here or click to upload"}
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => onFilesSelected(e.target.files)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Delete "${deleteTarget?.filename}"?`}
        description="This document and its embeddings will be permanently deleted."
        destructive
        onConfirm={confirmDelete}
      />
    </>
  );
}
