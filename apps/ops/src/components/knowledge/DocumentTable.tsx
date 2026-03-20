import { useEffect } from "react";
import {
  CheckCircle, AlertCircle, Loader2, Clock,
  RefreshCw, Trash2, FileText,
} from "lucide-react";
import {
  Button, ResourceTable, relativeTime,
} from "@modularmind/ui";
import type { ResourceColumn, PaginationState } from "@modularmind/ui";
import type { KnowledgeDocument } from "@modularmind/api-client";
import { useKnowledgeStore } from "../../stores/knowledge";

function StatusIcon({ status }: { status: KnowledgeDocument["status"] }) {
  if (status === "ready") return <CheckCircle className="h-4 w-4 text-success" />;
  if (status === "failed") return <AlertCircle className="h-4 w-4 text-destructive" />;
  if (status === "processing") return <Loader2 className="h-4 w-4 animate-spin text-info" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const COLUMNS: ResourceColumn<KnowledgeDocument>[] = [
  {
    key: "status",
    header: "Status",
    className: "w-[70px]",
    render: (doc) => <StatusIcon status={doc.status} />,
  },
  {
    key: "filename",
    header: "Filename",
    render: (doc) => (
      <div className="min-w-0">
        <p className="text-sm font-medium truncate" title={doc.filename}>
          {doc.filename}
        </p>
        {doc.status === "failed" && doc.error_message && (
          <p className="text-xs text-destructive truncate mt-0.5" title={doc.error_message}>
            {doc.error_message}
          </p>
        )}
      </div>
    ),
  },
  {
    key: "chunks",
    header: "Chunks",
    className: "w-[80px]",
    render: (doc) => (
      <span className="text-sm tabular-nums">
        {doc.chunk_count > 0 ? doc.chunk_count : "—"}
      </span>
    ),
  },
  {
    key: "size",
    header: "Size",
    className: "w-[90px]",
    render: (doc) => (
      <span className="text-sm text-muted-foreground tabular-nums">
        {formatBytes(doc.size_bytes)}
      </span>
    ),
  },
  {
    key: "date",
    header: "Added",
    className: "w-[100px]",
    render: (doc) => (
      <span className="text-sm text-muted-foreground">
        {relativeTime(doc.created_at)}
      </span>
    ),
  },
];

interface Props {
  collectionId: string;
  documents: KnowledgeDocument[];
  isLoading: boolean;
}

export function DocumentTable({ collectionId, documents, isLoading }: Props) {
  const { refreshDocument, deleteDocument } = useKnowledgeStore();

  useEffect(() => {
    const processing = documents.filter(
      (d) => d.status === "processing" || d.status === "pending",
    );
    if (!processing.length) return;
    const intervalId = setInterval(() => {
      processing.forEach((d) => refreshDocument(d.id));
    }, 3000);
    return () => clearInterval(intervalId);
  }, [documents, refreshDocument]);

  const pagination: PaginationState = {
    page: 1,
    totalPages: 1,
    totalItems: documents.length,
  };

  return (
    <ResourceTable<KnowledgeDocument>
      items={documents}
      columns={COLUMNS}
      pagination={pagination}
      onPageChange={() => {}}
      keyExtractor={(doc) => doc.id}
      isLoading={isLoading}
      emptyState={
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FileText className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">No documents yet</p>
          <p className="text-xs mt-1">Upload files above to get started</p>
        </div>
      }
      rowActions={(doc) => (
        <div className="flex items-center gap-1 justify-end">
          {(doc.status === "processing" || doc.status === "pending") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => refreshDocument(doc.id)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={() => deleteDocument(doc.id, collectionId)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    />
  );
}
