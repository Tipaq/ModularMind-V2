import { useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  BookOpen, Loader2, AlertCircle, Trash2, Globe, Users, User,
} from "lucide-react";
import { Button, Badge, DetailHeader, cn } from "@modularmind/ui";
import { useKnowledgeStore } from "../stores/knowledge";
import { useAuthStore } from "@modularmind/ui";
import { UploadZone } from "../components/knowledge/UploadZone";
import { DocumentTable } from "../components/knowledge/DocumentTable";
import { CollectionSettings } from "../components/knowledge/CollectionSettings";

const SCOPE_CONFIG = {
  global: { label: "Company", icon: Globe, color: "text-info" },
  group: { label: "Group", icon: Users, color: "text-warning" },
  agent: { label: "Personal", icon: User, color: "text-primary" },
} as const;

function renderLink({ href, className, children }: { href: string; className: string; children: React.ReactNode }) {
  return <Link to={href} className={className}>{children}</Link>;
}

export function CollectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin" || user?.role === "owner";

  const {
    selectedCollection, selectedCollectionLoading, selectedCollectionError,
    documents, documentsLoading,
    fetchCollection, fetchDocuments, deleteCollection,
  } = useKnowledgeStore();

  useEffect(() => {
    if (!id) return;
    fetchCollection(id);
    fetchDocuments(id);
  }, [id, fetchCollection, fetchDocuments]);

  if (selectedCollectionLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (selectedCollectionError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-destructive">
        <AlertCircle className="h-8 w-8 mb-3" />
        <p className="text-sm font-medium">{selectedCollectionError}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/knowledge")}>
          Back to Knowledge
        </Button>
      </div>
    );
  }

  if (!selectedCollection) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <BookOpen className="h-8 w-8 mb-3 opacity-40" />
        <p className="text-sm">Collection not found</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/knowledge")}>
          Back to Knowledge
        </Button>
      </div>
    );
  }

  const scope = SCOPE_CONFIG[selectedCollection.scope] ?? SCOPE_CONFIG.global;
  const ScopeIcon = scope.icon;
  const canDelete = isAdmin || (selectedCollection.scope === "agent" && selectedCollection.owner_user_id === user?.id);

  const handleDelete = async () => {
    await deleteCollection(selectedCollection.id);
    navigate("/knowledge");
  };

  return (
    <div className="flex flex-col h-full">
      <DetailHeader
        backHref="/knowledge"
        backLabel="Knowledge"
        renderLink={renderLink}
        title={selectedCollection.name}
        badges={
          <>
            <Badge variant="outline" className={cn("gap-1", scope.color)}>
              <ScopeIcon className="h-3 w-3" />
              {scope.label}
            </Badge>
            <Badge variant="secondary" className="text-xs tabular-nums">
              {selectedCollection.document_count} docs
            </Badge>
            <Badge variant="secondary" className="text-xs tabular-nums">
              {selectedCollection.chunk_count} chunks
            </Badge>
          </>
        }
        actions={
          canDelete ? (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-8">
          {selectedCollection.description && (
            <p className="text-sm text-muted-foreground">{selectedCollection.description}</p>
          )}

          <UploadZone collectionId={selectedCollection.id} />

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Documents
            </h2>
            <DocumentTable
              collectionId={selectedCollection.id}
              documents={documents}
              isLoading={documentsLoading}
            />
          </div>

          <CollectionSettings collection={selectedCollection} />
        </div>
      </div>
    </div>
  );
}
