"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Building2,
  Edit,
  Key,
  Plus,
  RefreshCw,
  Save,
  Server,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Input,
  Label,
  Switch,
  relativeTime,
  DetailHeader,
} from "@modularmind/ui";
import Link from "next/link";
import { useClientsStore, type DeploymentConfig, type PlatformEngine } from "@/stores/clients";
import { EngineStatusBadge as StatusBadge } from "@/components/EngineStatusBadge";

// ─── Deployment Config defaults ─────────────────────────────────────────────

const DEPLOYMENT_DEFAULTS: Required<DeploymentConfig> = {
  proxyPort: 8080,
  domain: "",
  useGpu: false,
  useTraefik: false,
  ollamaEnabled: true,
  monitoringEnabled: false,
  grafanaPort: 3333,
  mmVersion: "latest",
};

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const clientId = params.id;

  const {
    selectedClient: client,
    loading,
    fetchClient,
    updateClient,
    deleteClient,
    addEngine,
    updateEngine,
    deleteEngine,
  } = useClientsStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [showAddEngine, setShowAddEngine] = useState(false);
  const [engineForm, setEngineForm] = useState({ name: "", url: "http://localhost:8000" });
  const [addingEngine, setAddingEngine] = useState(false);

  // Deployment config dialog
  const [deployEngine, setDeployEngine] = useState<PlatformEngine | null>(null);
  const [deployConfig, setDeployConfig] = useState<Required<DeploymentConfig>>(DEPLOYMENT_DEFAULTS);
  const [savingDeploy, setSavingDeploy] = useState(false);

  useEffect(() => {
    fetchClient(clientId);
  }, [clientId, fetchClient]);

  const startEditing = () => {
    if (!client) return;
    setEditName(client.name);
    setIsEditing(true);
  };

  const cancelEditing = () => setIsEditing(false);

  const handleSave = async () => {
    if (!client) return;
    setSaving(true);
    try {
      await updateClient(clientId, { name: editName });
      setIsEditing(false);
    } catch {
      // Error handled in store
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${client?.name}" and all its engines?`)) return;
    try {
      await deleteClient(clientId);
      router.push("/clients");
    } catch {
      // Error handled in store
    }
  };

  const handleAddEngine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!engineForm.name.trim()) return;
    setAddingEngine(true);
    try {
      await addEngine(clientId, {
        name: engineForm.name.trim(),
        url: engineForm.url.trim() || undefined,
      });
      setShowAddEngine(false);
      setEngineForm({ name: "", url: "http://localhost:8000" });
    } catch {
      // Error handled in store
    } finally {
      setAddingEngine(false);
    }
  };

  const handleDeleteEngine = async (engineId: string, engineName: string) => {
    if (!confirm(`Delete engine "${engineName}"?`)) return;
    try {
      await deleteEngine(engineId);
    } catch {
      // Error handled in store
    }
  };

  const openDeployConfig = (engine: PlatformEngine) => {
    setDeployEngine(engine);
    setDeployConfig({
      ...DEPLOYMENT_DEFAULTS,
      ...(engine.deploymentConfig ?? {}),
    } as Required<DeploymentConfig>);
  };

  const handleSaveDeploy = async () => {
    if (!deployEngine) return;
    setSavingDeploy(true);
    try {
      await updateEngine(deployEngine.id, { deploymentConfig: deployConfig });
      setDeployEngine(null);
    } catch {
      // Error handled in store
    } finally {
      setSavingDeploy(false);
    }
  };

  const toggleKey = (id: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading || !client) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <DetailHeader
        backHref="/clients"
        backLabel="Clients"
        renderLink={({ href, className, children }) => <Link href={href} className={className}>{children}</Link>}
        title={isEditing ? editName : client.name}
        isEditing={isEditing}
        onEditTitle={(v) => setEditName(v)}
        badges={
          <Badge variant="outline" className="text-xs">
            {client.engines?.length ?? 0} engine(s)
          </Badge>
        }
        actions={
          isEditing ? (
            <>
              <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={saving}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={startEditing}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </>
          )
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Client Info */}
        <section className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Info
            </h2>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{new Date(client.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Updated</span>
              <span>{new Date(client.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
        </section>

        {/* Engines */}
        <section className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Engines
              </h2>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowAddEngine(true)} className="gap-1">
              <Plus className="h-3.5 w-3.5" />
              Add Engine
            </Button>
          </div>

          {client.engines.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 text-muted-foreground">
              <Server className="mb-2 h-8 w-8 opacity-30" />
              <p className="text-sm">No engines yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4 hidden md:table-cell">URL</th>
                    <th className="pb-2 pr-4 hidden md:table-cell">Last Seen</th>
                    <th className="pb-2 pr-4 hidden lg:table-cell">Version</th>
                    <th className="pb-2 pr-4 hidden lg:table-cell">API Key</th>
                    <th className="pb-2 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {client.engines.map((engine) => (
                    <tr key={engine.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-medium">{engine.name}</td>
                      <td className="py-2.5 pr-4">
                        <StatusBadge status={engine.status} />
                      </td>
                      <td className="py-2.5 pr-4 hidden md:table-cell">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {engine.url}
                        </code>
                      </td>
                      <td className="py-2.5 pr-4 hidden md:table-cell text-muted-foreground">
                        {engine.lastSeen ? relativeTime(engine.lastSeen) : "Never"}
                      </td>
                      <td className="py-2.5 pr-4 hidden lg:table-cell font-mono">
                        v{engine.version}
                      </td>
                      <td className="py-2.5 pr-4 hidden lg:table-cell">
                        <div className="flex items-center gap-1">
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {revealedKeys.has(engine.id)
                              ? engine.apiKey
                              : `${engine.apiKey.slice(0, 8)}...`}
                          </code>
                          <button
                            onClick={() => toggleKey(engine.id)}
                            className="text-primary hover:text-primary/80"
                          >
                            <Key className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openDeployConfig(engine)}
                            className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                            title="Deployment config"
                          >
                            <Settings className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteEngine(engine.id, engine.name)}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Add Engine Dialog */}
      <Dialog open={showAddEngine} onOpenChange={setShowAddEngine}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Engine</DialogTitle>
            <DialogDescription>
              Add a new engine to {client.name}. An API key will be auto-generated.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddEngine} className="space-y-4 py-2">
            <Input
              label="Engine Name"
              value={engineForm.name}
              onChange={(e) => setEngineForm({ ...engineForm, name: e.target.value })}
              placeholder={`${client.name} Engine`}
              required
            />
            <Input
              label="URL"
              value={engineForm.url}
              onChange={(e) => setEngineForm({ ...engineForm, url: e.target.value })}
              placeholder="http://localhost:8000"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setShowAddEngine(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addingEngine || !engineForm.name.trim()}>
                {addingEngine ? "Adding..." : "Add Engine"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deployment Config Dialog */}
      <Dialog open={!!deployEngine} onOpenChange={() => setDeployEngine(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Deployment Configuration</DialogTitle>
            <DialogDescription>
              Configure infrastructure settings for {deployEngine?.name}. These will be used by the installer script.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Network */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Network
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Proxy Port"
                  type="number"
                  value={String(deployConfig.proxyPort)}
                  onChange={(e) =>
                    setDeployConfig({ ...deployConfig, proxyPort: parseInt(e.target.value) || 8080 })
                  }
                  placeholder="8080"
                />
                <Input
                  label="Domain"
                  value={deployConfig.domain}
                  onChange={(e) => setDeployConfig({ ...deployConfig, domain: e.target.value })}
                  placeholder="mm.example.com"
                />
              </div>
            </div>

            {/* Toggles */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Features
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">GPU Acceleration</Label>
                    <p className="text-xs text-muted-foreground">Enable NVIDIA GPU for Ollama</p>
                  </div>
                  <Switch
                    checked={deployConfig.useGpu}
                    onCheckedChange={(v) => setDeployConfig({ ...deployConfig, useGpu: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Traefik Integration</Label>
                    <p className="text-xs text-muted-foreground">Auto TLS with Let&apos;s Encrypt</p>
                  </div>
                  <Switch
                    checked={deployConfig.useTraefik}
                    onCheckedChange={(v) => setDeployConfig({ ...deployConfig, useTraefik: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Ollama</Label>
                    <p className="text-xs text-muted-foreground">Local LLM runtime</p>
                  </div>
                  <Switch
                    checked={deployConfig.ollamaEnabled}
                    onCheckedChange={(v) => setDeployConfig({ ...deployConfig, ollamaEnabled: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Monitoring</Label>
                    <p className="text-xs text-muted-foreground">Prometheus + Grafana</p>
                  </div>
                  <Switch
                    checked={deployConfig.monitoringEnabled}
                    onCheckedChange={(v) => setDeployConfig({ ...deployConfig, monitoringEnabled: v })}
                  />
                </div>
              </div>
            </div>

            {/* Advanced */}
            {deployConfig.monitoringEnabled && (
              <Input
                label="Grafana Port"
                type="number"
                value={String(deployConfig.grafanaPort)}
                onChange={(e) =>
                  setDeployConfig({ ...deployConfig, grafanaPort: parseInt(e.target.value) || 3333 })
                }
                placeholder="3333"
              />
            )}

            <Input
              label="Image Version"
              value={deployConfig.mmVersion}
              onChange={(e) => setDeployConfig({ ...deployConfig, mmVersion: e.target.value })}
              placeholder="latest"
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setDeployEngine(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveDeploy} disabled={savingDeploy}>
                {savingDeploy ? "Saving..." : "Save Configuration"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
