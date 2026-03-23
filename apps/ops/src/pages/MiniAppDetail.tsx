import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, FileCode, Database, History, Trash2, RotateCcw } from "lucide-react";
import { MiniAppViewer } from "@modularmind/ui";
import type { MiniApp, StorageKey, StorageValue, MiniAppSnapshot } from "@modularmind/api-client";
import { api } from "../lib/api";

interface StorageEntry extends StorageKey {
  value?: unknown;
}

export function MiniAppDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<MiniApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"preview" | "files" | "storage" | "snapshots">("preview");
  const [showViewer, setShowViewer] = useState(false);
  const [storageEntries, setStorageEntries] = useState<StorageEntry[]>([]);
  const [snapshots, setSnapshots] = useState<MiniAppSnapshot[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  const loadStorage = useCallback(async () => {
    if (!id) return;
    setTabLoading(true);
    try {
      const keys = await api.get<StorageKey[]>(`/mini-apps/${id}/storage`);
      const withValues = await Promise.all(
        keys.map(async (entry) => {
          const data = await api.get<StorageValue>(`/mini-apps/${id}/storage/${encodeURIComponent(entry.key)}`);
          return { ...entry, value: data.value };
        }),
      );
      setStorageEntries(withValues);
    } catch {
      setStorageEntries([]);
    } finally {
      setTabLoading(false);
    }
  }, [id]);

  const deleteStorageKey = async (key: string) => {
    if (!id) return;
    await api.delete(`/mini-apps/${id}/storage/${encodeURIComponent(key)}`);
    setStorageEntries((prev) => prev.filter((e) => e.key !== key));
  };

  const loadSnapshots = useCallback(async () => {
    if (!id) return;
    setTabLoading(true);
    try {
      const data = await api.get<MiniAppSnapshot[]>(`/mini-apps/${id}/snapshots`);
      setSnapshots(data);
    } catch {
      setSnapshots([]);
    } finally {
      setTabLoading(false);
    }
  }, [id]);

  const rollbackSnapshot = async (version: number) => {
    if (!id || !confirm(`Rollback to v${version}? Current state will be auto-backed up.`)) return;
    await api.post(`/mini-apps/${id}/snapshots/${version}/rollback`);
    loadSnapshots();
  };

  useEffect(() => {
    if (activeTab === "storage") loadStorage();
    if (activeTab === "snapshots") loadSnapshots();
  }, [activeTab, loadStorage, loadSnapshots]);

  useEffect(() => {
    async function load() {
      if (!id) return;
      setLoading(true);
      try {
        const data = await api.get<MiniApp>(`/mini-apps/${id}`);
        setApp(data);
      } catch {
        setApp(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return <div className="p-6"><div className="h-8 w-48 bg-muted/30 animate-pulse rounded" /></div>;
  }

  if (!app) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Mini app not found.</p>
      </div>
    );
  }

  const isDark = document.documentElement.classList.contains("dark");
  const serveUrl = `/api/v1/mini-apps/${app.id}/serve?theme=${isDark ? "dark" : "light"}`;

  const TABS = [
    { key: "preview", label: "Preview", icon: ExternalLink },
    { key: "files", label: "Files", icon: FileCode },
    { key: "storage", label: "Storage", icon: Database },
    { key: "snapshots", label: "Snapshots", icon: History },
  ] as const;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/mini-apps")}
          className="p-1.5 rounded hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold">{app.name}</h1>
          <p className="text-sm text-muted-foreground">
            {app.scope} &middot; v{app.version} &middot; {app.slug}
          </p>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setShowViewer(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open App
          </button>
        </div>
      </div>

      {app.description && (
        <p className="text-sm text-muted-foreground">{app.description}</p>
      )}

      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-[400px]">
        {activeTab === "preview" && (
          <div className="rounded-lg border border-border overflow-hidden" style={{ height: 500 }}>
            <iframe
              src={serveUrl}
              sandbox="allow-scripts allow-forms allow-same-origin"
              className="w-full h-full border-0"
              title={app.name}
            />
          </div>
        )}

        {activeTab === "files" && (
          <div className="space-y-2">
            {app.files?.length ? (
              app.files.map((f) => (
                <div
                  key={f.path}
                  className="flex items-center justify-between px-4 py-2 rounded-md border border-border"
                >
                  <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-mono">{f.path}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {f.size_bytes} bytes &middot; {f.content_type}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No files yet.</p>
            )}
          </div>
        )}

        {activeTab === "storage" && (
          tabLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 rounded-md bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : storageEntries.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Database className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No storage keys yet.</p>
            </div>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Key</th>
                    <th className="text-left px-4 py-2 font-medium">Value</th>
                    <th className="text-left px-4 py-2 font-medium">Updated</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {storageEntries.map((entry) => (
                    <tr key={entry.key} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs">{entry.key}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground max-w-[300px] truncate">
                        {JSON.stringify(entry.value)}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {new Date(entry.updated_at).toLocaleString()}
                      </td>
                      <td className="px-2">
                        <button
                          onClick={() => deleteStorageKey(entry.key)}
                          className="p-1 rounded hover:bg-destructive/10 text-destructive"
                          title="Delete key"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {activeTab === "snapshots" && (
          tabLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 rounded-md bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : snapshots.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <History className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No snapshots yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Snapshots are auto-created when files are updated.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="flex items-center justify-between px-4 py-3 rounded-md border border-border"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold">
                      v{snap.version}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {snap.label || `Version ${snap.version}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(snap.created_at).toLocaleString()} &middot; {snap.file_manifest.length} file(s)
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => rollbackSnapshot(snap.version)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border hover:bg-muted transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Rollback
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {showViewer && (
        <div className="fixed inset-0 z-50">
          <MiniAppViewer
            appId={app.id}
            appUrl={serveUrl}
            appName={app.name}
            onClose={() => setShowViewer(false)}
          />
        </div>
      )}
    </div>
  );
}
