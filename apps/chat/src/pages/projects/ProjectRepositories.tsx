import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  GitBranch, Plus, Trash2, ExternalLink, Loader2, Check, AlertCircle, Clock,
  RotateCw,
} from "lucide-react";
import {
  Badge, Button, EmptyState, Input, relativeTime,
} from "@modularmind/ui";
import type {
  ProjectDetail, ProjectRepository, ProjectRepoAdd, RepoIndexStatus,
} from "@modularmind/api-client";
import { api } from "../../lib/api";

interface ProjectContext {
  project: ProjectDetail;
  reload: () => void;
}

const STATUS_CONFIG: Record<RepoIndexStatus, {
  label: string;
  icon: typeof Check;
  className: string;
}> = {
  pending: { label: "Pending", icon: Clock, className: "text-muted-foreground" },
  indexing: { label: "Indexing…", icon: Loader2, className: "text-info" },
  ready: { label: "Indexed", icon: Check, className: "text-success" },
  failed: { label: "Failed", icon: AlertCircle, className: "text-destructive" },
};

export function ProjectRepositories() {
  const { project, reload } = useOutletContext<ProjectContext>();
  const [repos, setRepos] = useState<ProjectRepository[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRepo, setNewRepo] = useState<ProjectRepoAdd>({ repo_identifier: "" });
  const [adding, setAdding] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    setLoading(true);
    loadRepos().finally(() => setLoading(false));
  }, [loadRepos]);

  useEffect(() => {
    const hasInProgress = repos.some(
      (r) => r.index_status === "pending" || r.index_status === "indexing",
    );
    if (hasInProgress && !pollRef.current) {
      pollRef.current = setInterval(() => { loadRepos(); }, 5000);
    } else if (!hasInProgress && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [repos, loadRepos]);

  const handleAdd = async () => {
    if (!newRepo.repo_identifier.trim()) return;
    setAdding(true);
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
      setShowAddForm(false);
      await loadRepos();
      reload();
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (repoId: string) => {
    await api.delete(`/projects/${project.id}/repositories/${repoId}`);
    await loadRepos();
    reload();
  };

  const handleReindex = async (repoId: string) => {
    await api.post(`/projects/${project.id}/repositories/${repoId}/reindex`, {});
    await loadRepos();
  };

  if (loading) {
    return (
      <div className="p-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/50" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">Code Repositories</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Linked repos are indexed by FastCode and scoped to this project&apos;s agents.
          </p>
        </div>
        {!showAddForm && (
          <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Repository
          </Button>
        )}
      </div>

      {showAddForm && (
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              GitHub repository (owner/repo or full URL)
            </label>
            <Input
              placeholder="e.g. tipaq/ModularMind-V2"
              value={newRepo.repo_identifier}
              onChange={(event) => setNewRepo({ ...newRepo, repo_identifier: event.target.value })}
              onKeyDown={(event) => event.key === "Enter" && handleAdd()}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Display name (optional)
            </label>
            <Input
              placeholder="e.g. Backend API"
              value={newRepo.display_name ?? ""}
              onChange={(event) => setNewRepo({ ...newRepo, display_name: event.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleAdd} disabled={adding || !newRepo.repo_identifier.trim()}>
              {adding ? "Adding..." : "Add"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {repos.length === 0 && !showAddForm && (
        <EmptyState
          icon={GitBranch}
          title="No repositories linked"
          description="Add GitHub repositories to scope FastCode access for this project's agents."
        />
      )}

      {repos.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {repos.map((repo) => {
            const statusConfig = STATUS_CONFIG[repo.index_status];
            const StatusIcon = statusConfig.icon;
            const isAnimated = repo.index_status === "indexing";

            return (
              <div key={repo.id} className="group rounded-xl border border-border/50 bg-card/50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-medium text-sm truncate">
                        {repo.display_name ?? repo.repo_identifier}
                      </h3>
                      {repo.display_name && (
                        <p className="text-xs text-muted-foreground truncate">{repo.repo_identifier}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {(repo.index_status === "ready" || repo.index_status === "failed") && (
                      <button
                        onClick={() => handleReindex(repo.id)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Re-index"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(repo.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Remove from project"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <div className={`flex items-center gap-1 text-[11px] ${statusConfig.className}`}>
                    <StatusIcon className={`h-3 w-3 ${isAnimated ? "animate-spin" : ""}`} />
                    {statusConfig.label}
                  </div>

                  {repo.index_status === "failed" && repo.index_error && (
                    <span
                      className="text-[10px] text-destructive truncate max-w-[200px]"
                      title={repo.index_error}
                    >
                      {repo.index_error}
                    </span>
                  )}

                  {repo.repo_url && (
                    <a
                      href={repo.repo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      GitHub
                    </a>
                  )}
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  {repo.indexed_at && (
                    <Badge variant="outline" className="text-[10px]">
                      Indexed {relativeTime(repo.indexed_at)}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    Added {relativeTime(repo.added_at)}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function extractRepoIdentifier(url: string): string {
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  return match ? match[1].replace(/\.git$/, "") : url;
}

export default ProjectRepositories;
