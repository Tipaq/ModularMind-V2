import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, Upload } from "lucide-react";
import { Badge, Button, EmptyState, relativeTime } from "@modularmind/ui";
import type { Collection, KnowledgeDocument, DocumentListResponse } from "@modularmind/api-client";
import { api } from "../../lib/api";

export function KnowledgeDetail() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadData = useCallback(async () => {
    if (!collectionId) return;
    setLoading(true);
    try {
      const [col, docs] = await Promise.all([
        api.get<Collection>(`/rag/collections/${collectionId}`),
        api.get<DocumentListResponse>(`/rag/collections/${collectionId}/documents?page_size=100`),
      ]);
      setCollection(col);
      setDocuments(docs.items ?? []);
    } catch {
      setCollection(null);
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleUpload = useCallback(async (files: FileList) => {
    if (!collectionId || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        await api.upload(`/rag/collections/${collectionId}/documents`, formData);
      }
      await loadData();
    } finally {
      setUploading(false);
    }
  }, [collectionId, loadData]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">Collection not found</p>
        <Button variant="outline" onClick={() => navigate("/knowledge")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Knowledge
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/knowledge")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold truncate">{collection.name}</h1>
          {collection.description && (
            <p className="text-sm text-muted-foreground truncate">{collection.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline">{collection.document_count} docs</Badge>
          <Badge variant="outline">{collection.chunk_count} chunks</Badge>
        </div>
      </div>

      <div
        className="rounded-xl border-2 border-dashed border-border/50 p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
        onClick={() => document.getElementById("file-upload")?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && document.getElementById("file-upload")?.click()}
      >
        <Upload className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">
          {uploading ? "Uploading..." : "Click or drag files to upload"}
        </p>
        <input
          id="file-upload"
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleUpload(e.target.files)}
        />
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Upload documents to start building your knowledge base."
        />
      ) : (
        <div className="rounded-xl border border-border/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Filename</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Status</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Chunks</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Added</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium truncate max-w-[200px]">{doc.filename}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <StatusBadge status={doc.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {doc.chunk_count}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                    {relativeTime(doc.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    ready: { label: "Ready", className: "bg-success/10 text-success" },
    processing: { label: "Processing", className: "bg-warning/10 text-warning" },
    pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
    failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
  };
  const cfg = config[status] ?? config.pending;
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cfg.className}`}>{cfg.label}</span>;
}

export default KnowledgeDetail;
