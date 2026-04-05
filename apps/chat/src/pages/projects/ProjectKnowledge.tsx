import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  FileText, Search, Trash2, Upload, GitBranch, Plus,
  ExternalLink, Loader2, Check, AlertCircle, Clock, RotateCw,
} from "lucide-react";
import { Badge, Button, ConfirmDialog, Input, relativeTime } from "@modularmind/ui";
import type { ProjectDetail, ProjectRepository, ProjectRepoAdd, RepoIndexStatus } from "@modularmind/api-client";
import { api } from "@modularmind/api-client";
import { useKnowledgeHub } from "../../hooks/useKnowledgeHub";
import type { KnowledgeDocumentWithSource } from "../../hooks/useKnowledgeHub";

interface ProjectContext {
  project: ProjectDetail;
  reload: () => void;
}

const DOC_STATUS: Record<string, { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-success/10 text-success" },
  processing: { label: "Processing", className: "bg-warning/10 text-warning" },
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
};

const REPO_STATUS: Record<RepoIndexStatus, {
  label: string;
  icon: typeof Check;
  className: string;
}> = {
  pending: { label: "Pending", icon: Clock, className: "text-muted-foreground" },
  indexing: { label: "Indexing…", icon: Loader2, className: "text-info" },
  ready: { label: "Indexed", icon: Check, className: "text-success" },
  failed: { label: "Failed", icon: AlertCircle, className: "text-destructive" },
};

export function ProjectKnowledge() {
  const { project, reload } = useOutletContext<ProjectContext>();

  const {
    documents, totalDocuments, loading: docsLoading, uploading,
    search, setSearch, handleUpload, handleDelete,
  } = useKnowledgeHub({ projectId: project.id });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDocumentWithSource | null>(null);

  const [repos, setRepos] = useState<ProjectRepository[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [newRepo, setNewRepo] = useState<ProjectRepoAdd>({ repo_identifier: "" });
  const [addingRepo, setAddingRepo] = useState(false);

  const loadRepos = useCallback(async () => {
    try {
      const data = await api.get<ProjectRepository[]>(
        `/projects/${project.id}/repositories`,
      );
      setRepos(data);
      return data;
    } catch {
      setRepos([]);
      return [];
    }
  }, [project.id]);

  useEffect(() => {
    setReposLoading(true);
    loadRepos().finally(() => setReposLoading(false));
  }, [loadRepos]);

  useEffect(() => {
    const hasInProgress = repos.some(
      (r) => r.index_status === "pending" || r.index_status === "indexing",
    );
    if (!hasInProgress) return;
    const interval = setInterval(() => { loadRepos(); }, 5000);
    return () => clearInterval(interval);
  }, [repos, loadRepos]);

  const handleAddRepo = useCallback(async () => {
    if (!newRepo.repo_identifier.trim()) return;
    setAddingRepo(true);
    try {
      const identifier = newRepo.repo_identifier.trim();
      const repoUrl = identifier.includes("github.com")
        ? identifier
        : `https://github.com/${identifier}`;
      const cleanIdentifier = identifier.includes("github.com")
        ? extractRepoIdentifier(identifier)
        : identifier;

      await api.post(`/projects/${project.id}/repositories`, {
        repo_identifier: cleanIdentifier,
        repo_url: repoUrl,
        display_name: newRepo.display_name?.trim() || null,
      });
      setNewRepo({ repo_identifier: "" });
      setShowAddRepo(false);
      await loadRepos();
      reload();
    } finally {
      setAddingRepo(false);
    }
  }, [newRepo, project.id, loadRepos, reload]);

  const handleDeleteRepo = useCallback(async (repoId: string) => {
    await api.delete(`/projects/${project.id}/repositories/${repoId}`);
    await loadRepos();
    reload();
  }, [project.id, loadRepos, reload]);

  const handleReindex = useCallback(async (repoId: string) => {
    await api.post(`/projects/${project.id}/repositories/${repoId}/reindex`, {});
    setRepos((prev) =>
      prev.map((r) =>
        r.id === repoId ? { ...r, index_status: "pending" as const, index_error: null } : r,
      ),
    );
  }, [project.id]);

  const onFilesSelected = useCallback(
    (files: FileList | null) => { if (files) handleUpload(files); },
    [handleUpload],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await handleDelete(deleteTarget.id, deleteTarget.collection_id);
    setDeleteTarget(null);
  }, [deleteTarget, handleDelete]);

  const loading = docsLoading || reposLoading;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">Knowledge</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Documents and code sources for this project.
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Documents section */}
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

        {docsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/50" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            {search ? "No documents match your search." : "No documents yet."}
          </p>
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

      {/* Repositories section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Repositories</h3>
          </div>
          {!showAddRepo && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAddRepo(true)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {showAddRepo && (
          <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3 mb-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                GitHub repository (owner/repo or full URL)
              </label>
              <Input
                placeholder="e.g. tipaq/ModularMind-V2"
                value={newRepo.repo_identifier}
                onChange={(e) => setNewRepo({ ...newRepo, repo_identifier: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleAddRepo()}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleAddRepo} disabled={addingRepo || !newRepo.repo_identifier.trim()}>
                {addingRepo ? "Adding..." : "Add"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAddRepo(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {reposLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/50" />
            ))}
          </div>
        ) : repos.length === 0 && !showAddRepo ? (
          <p className="text-xs text-muted-foreground py-2">
            No repositories linked. Add a GitHub repo to index its code.
          </p>
        ) : repos.length > 0 ? (
          <div className="rounded-xl border border-border/50 overflow-hidden">
            {repos.map((repo) => {
              const statusConfig = REPO_STATUS[repo.index_status];
              const StatusIcon = statusConfig.icon;
              const isAnimated = repo.index_status === "indexing";

              return (
                <div
                  key={repo.id}
                  className="group flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {repo.display_name ?? repo.repo_identifier}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`flex items-center gap-1 text-[11px] ${statusConfig.className}`}>
                        <StatusIcon className={`h-3 w-3 ${isAnimated ? "animate-spin" : ""}`} />
                        {statusConfig.label}
                      </span>
                      {repo.repo_url && (
                        <a
                          href={repo.repo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3" />
                          GitHub
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {(repo.index_status === "ready" || repo.index_status === "failed") && (
                      <button
                        onClick={() => handleReindex(repo.id)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Re-index"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteRepo(repo.id)}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
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

function extractRepoIdentifier(url: string): string {
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  return match ? match[1].replace(/\.git$/, "") : url;
}

export default ProjectKnowledge;
