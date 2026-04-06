import { useCallback, useEffect, useState } from "react";
import {
  GitBranch, Plus, ExternalLink, Loader2, Check, AlertCircle, Clock, RotateCw, Trash2,
} from "lucide-react";
import { Button, Input } from "@modularmind/ui";
import type { ProjectRepository, ProjectRepoAdd, RepoIndexStatus } from "@modularmind/api-client";
import { api } from "@modularmind/api-client";

const REPO_STATUS: Record<RepoIndexStatus, {
  label: string;
  icon: typeof Check;
  className: string;
}> = {
  pending: { label: "Pending", icon: Clock, className: "text-muted-foreground" },
  indexing: { label: "Indexing...", icon: Loader2, className: "text-info" },
  ready: { label: "Indexed", icon: Check, className: "text-success" },
  failed: { label: "Failed", icon: AlertCircle, className: "text-destructive" },
};

const POLL_INTERVAL_MS = 5000;

function extractRepoIdentifier(url: string): string {
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  return match ? match[1].replace(/\.git$/, "") : url;
}

interface RepositoriesSectionProps {
  projectId: string;
  onRepoChange: () => void;
}

export function RepositoriesSection({ projectId, onRepoChange }: RepositoriesSectionProps) {
  const [repos, setRepos] = useState<ProjectRepository[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [newRepo, setNewRepo] = useState<ProjectRepoAdd>({ repo_identifier: "" });
  const [addingRepo, setAddingRepo] = useState(false);

  const loadRepos = useCallback(async () => {
    try {
      const data = await api.get<ProjectRepository[]>(
        `/projects/${projectId}/repositories`,
      );
      setRepos(data);
      return data;
    } catch {
      setRepos([]);
      return [];
    }
  }, [projectId]);

  useEffect(() => {
    setReposLoading(true);
    loadRepos().finally(() => setReposLoading(false));
  }, [loadRepos]);

  useEffect(() => {
    const hasInProgress = repos.some(
      (r) => r.index_status === "pending" || r.index_status === "indexing",
    );
    if (!hasInProgress) return;
    const interval = setInterval(() => { loadRepos(); }, POLL_INTERVAL_MS);
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

      await api.post(`/projects/${projectId}/repositories`, {
        repo_identifier: cleanIdentifier,
        repo_url: repoUrl,
        display_name: newRepo.display_name?.trim() || null,
      });
      setNewRepo({ repo_identifier: "" });
      setShowAddRepo(false);
      await loadRepos();
      onRepoChange();
    } finally {
      setAddingRepo(false);
    }
  }, [newRepo, projectId, loadRepos, onRepoChange]);

  const handleDeleteRepo = useCallback(async (repoId: string) => {
    await api.delete(`/projects/${projectId}/repositories/${repoId}`);
    await loadRepos();
    onRepoChange();
  }, [projectId, loadRepos, onRepoChange]);

  const handleReindex = useCallback(async (repoId: string) => {
    await api.post(`/projects/${projectId}/repositories/${repoId}/reindex`, {});
    setRepos((prev) =>
      prev.map((r) =>
        r.id === repoId ? { ...r, index_status: "pending" as const, index_error: null } : r,
      ),
    );
  }, [projectId]);

  return (
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
  );
}
