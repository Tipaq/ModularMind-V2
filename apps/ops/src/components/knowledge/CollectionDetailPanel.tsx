import { useRef, useState, useEffect } from "react";
import {
  Upload, FileText, Trash2, AlertCircle, CheckCircle,
  Loader2, Clock, X, RefreshCw,
} from "lucide-react";
import { Button, Badge, Separator } from "@modularmind/ui";
import type { Collection, KnowledgeDocument } from "@modularmind/api-client";
import { useKnowledgeStore } from "../../stores/knowledge";

function StatusIcon({ status }: { status: KnowledgeDocument["status"] }) {
  if (status === "ready")      return <CheckCircle className="h-3.5 w-3.5 text-success shrink-0" />;
  if (status === "failed")     return <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />;
  if (status === "processing") return <Loader2 className="h-3.5 w-3.5 animate-spin text-info shrink-0" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const SCOPE_LABELS = { global: "Company", group: "Group", agent: "Personal" } as const;

interface Props {
  collection: Collection;
  documents: KnowledgeDocument[];
  documentsLoading: boolean;
  onClose: () => void;
}

export function CollectionDetailPanel({ collection, documents, documentsLoading, onClose }: Props) {
  const { uploadDocument, deleteDocument, refreshDocument, uploading } = useKnowledgeStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Auto-refresh processing documents every 3s
  useEffect(() => {
    const processing = documents.filter((d) => d.status === "processing" || d.status === "pending");
    if (!processing.length) return;
    const id = setInterval(() => {
      processing.forEach((d) => refreshDocument(d.id));
    }, 3000);
    return () => clearInterval(id);
  }, [documents, refreshDocument]);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      await uploadDocument(collection.id, file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="w-80 shrink-0 flex flex-col border rounded-xl bg-card overflow-hidden h-[calc(100vh-14rem)] sticky top-4">
      {/* Header */}
      <div className="flex items-start gap-2 p-4 border-b">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{collection.name}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {collection.document_count} docs · {collection.chunk_count} chunks
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Upload zone */}
      <div className="p-3 border-b">
        <div
          className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors cursor-pointer ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/40"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
          ) : (
            <Upload className="h-5 w-5 text-muted-foreground mx-auto" />
          )}
          <p className="text-xs text-muted-foreground mt-1.5">
            {uploading ? "Uploading…" : "Drop files or click to upload"}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            PDF · DOCX · TXT · MD · max 50 MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.docx,.doc,.txt,.md,.markdown"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto">
        {documentsLoading ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-muted-foreground">
            <FileText className="h-5 w-5 mb-1.5 opacity-40" />
            <p className="text-xs">No documents yet</p>
          </div>
        ) : (
          <div className="divide-y">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-start gap-2 px-4 py-3 group hover:bg-muted/30">
                <StatusIcon status={doc.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" title={doc.filename}>
                    {doc.filename}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {doc.chunk_count > 0 ? `${doc.chunk_count} chunks` : doc.status}
                    {doc.size_bytes ? ` · ${formatBytes(doc.size_bytes)}` : ""}
                  </p>
                  {doc.status === "failed" && doc.error_message && (
                    <p
                      className="text-[10px] text-destructive mt-0.5 truncate"
                      title={doc.error_message}
                    >
                      {doc.error_message}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                  {(doc.status === "processing" || doc.status === "pending") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => refreshDocument(doc.id)}
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                    onClick={() => deleteDocument(doc.id, collection.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-2 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span>Chunk {collection.chunk_size}</span>
        <Separator orientation="vertical" className="h-3" />
        <span>Overlap {collection.chunk_overlap}</span>
        <Badge variant="outline" className="text-[9px] capitalize ml-auto">
          {SCOPE_LABELS[collection.scope] ?? collection.scope}
        </Badge>
      </div>
    </div>
  );
}
