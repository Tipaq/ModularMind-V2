"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Building2,
  Edit,
  Globe,
  Key,
  Layers,
  Package,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
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

const VERSION_OPTIONS = [
  { value: "latest", label: "latest", description: "Latest stable build" },
  { value: "dev", label: "dev", description: "Development build" },
];

// ─── Section header component ───────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }: { icon: typeof Server; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
    </div>
  );
}

// ─── Toggle row component ───────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  children,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      {checked && children && (
        <div className="ml-2 border-l-2 border-primary/20 pl-4 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Engine Config Dialog ───────────────────────────────────────────────────

function EngineConfigDialog({
  open,
  onOpenChange,
  editingEngine,
  clientName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingEngine: PlatformEngine | null;
  clientName: string;
  onSubmit: (form: { name: string; url: string }, config: Required<DeploymentConfig>) => Promise<void>;
}) {
  const isEditing = !!editingEngine;

  const [engineForm, setEngineForm] = useState({ name: "", url: "http://localhost:8000" });
  const [config, setConfig] = useState<Required<DeploymentConfig>>(DEPLOYMENT_DEFAULTS);
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (editingEngine) {
        setEngineForm({ name: editingEngine.name, url: editingEngine.url });
        setConfig({
          ...DEPLOYMENT_DEFAULTS,
          ...(editingEngine.deploymentConfig ?? {}),
        } as Required<DeploymentConfig>);
      } else {
        setEngineForm({ name: "", url: "http://localhost:8000" });
        setConfig(DEPLOYMENT_DEFAULTS);
      }
    }
  }, [open, editingEngine]);

  const handleSubmit = async () => {
    if (!engineForm.name.trim()) return;
    setSaving(true);
    try {
      await onSubmit(engineForm, config);
      onOpenChange(false);
    } catch {
      // Error handled in store
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (patch: Partial<DeploymentConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Engine Configuration" : "Add Engine"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Configure deployment settings for ${editingEngine.name}.`
              : `Add a new engine to ${clientName} and configure its deployment.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* ── Engine Identity ── */}
          <section>
            <SectionHeader icon={Server} title="Engine" />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Name"
                value={engineForm.name}
                onChange={(e) => setEngineForm({ ...engineForm, name: e.target.value })}
                placeholder={`${clientName} Engine`}
                required
              />
              <Input
                label="URL"
                value={engineForm.url}
                onChange={(e) => setEngineForm({ ...engineForm, url: e.target.value })}
                placeholder="http://localhost:8000"
              />
            </div>
          </section>

          <Separator />

          {/* ── Services ── */}
          <section>
            <SectionHeader icon={Layers} title="Services" />
            <div className="space-y-3">
              <ToggleRow
                label="Ollama"
                description="Local LLM runtime for running open-source models"
                checked={config.ollamaEnabled}
                onCheckedChange={(v) => updateConfig({ ollamaEnabled: v, ...(!v && { useGpu: false }) })}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">GPU Acceleration</Label>
                    <p className="text-xs text-muted-foreground">
                      Enable NVIDIA CUDA for faster inference
                    </p>
                  </div>
                  <Switch
                    checked={config.useGpu}
                    onCheckedChange={(v) => updateConfig({ useGpu: v })}
                  />
                </div>
              </ToggleRow>

              <ToggleRow
                label="Monitoring"
                description="Prometheus metrics + Grafana dashboards"
                checked={config.monitoringEnabled}
                onCheckedChange={(v) => updateConfig({ monitoringEnabled: v })}
              >
                <Input
                  label="Grafana Port"
                  type="number"
                  value={String(config.grafanaPort)}
                  onChange={(e) => updateConfig({ grafanaPort: parseInt(e.target.value) || 3333 })}
                  placeholder="3333"
                />
              </ToggleRow>
            </div>
          </section>

          <Separator />

          {/* ── Network ── */}
          <section>
            <SectionHeader icon={Globe} title="Network" />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Proxy Port"
                type="number"
                value={String(config.proxyPort)}
                onChange={(e) => updateConfig({ proxyPort: parseInt(e.target.value) || 8080 })}
                placeholder="8080"
              />
              <Input
                label="Domain"
                value={config.domain}
                onChange={(e) => updateConfig({ domain: e.target.value })}
                placeholder="mm.example.com"
              />
            </div>
            <div className="mt-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Traefik</Label>
                  <p className="text-xs text-muted-foreground">
                    Reverse proxy with automatic TLS via Let&apos;s Encrypt
                  </p>
                </div>
                <Switch
                  checked={config.useTraefik}
                  onCheckedChange={(v) => updateConfig({ useTraefik: v })}
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* ── Deployment ── */}
          <section>
            <SectionHeader icon={Package} title="Deployment" />
            <div className="space-y-2">
              <Label className="text-sm font-medium">Image Version</Label>
              <Select
                value={config.mmVersion}
                onValueChange={(v) => updateConfig({ mmVersion: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  {VERSION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">— {opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !engineForm.name.trim()}>
            {saving ? "Saving..." : isEditing ? "Save Configuration" : "Create Engine"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

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

  // Unified engine dialog state
  const [engineDialogOpen, setEngineDialogOpen] = useState(false);
  const [editingEngine, setEditingEngine] = useState<PlatformEngine | null>(null);

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

  const openAddEngine = () => {
    setEditingEngine(null);
    setEngineDialogOpen(true);
  };

  const openEditEngine = (engine: PlatformEngine) => {
    setEditingEngine(engine);
    setEngineDialogOpen(true);
  };

  const handleEngineSubmit = async (
    form: { name: string; url: string },
    config: Required<DeploymentConfig>,
  ) => {
    if (editingEngine) {
      await updateEngine(editingEngine.id, {
        name: form.name,
        url: form.url,
        deploymentConfig: config,
      });
    } else {
      await addEngine(clientId, {
        name: form.name.trim(),
        url: form.url.trim() || undefined,
        deploymentConfig: config,
      });
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
            <Button size="sm" variant="outline" onClick={openAddEngine} className="gap-1">
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
                            onClick={() => openEditEngine(engine)}
                            className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                            title="Edit configuration"
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

      {/* Unified Engine Config Dialog */}
      <EngineConfigDialog
        open={engineDialogOpen}
        onOpenChange={setEngineDialogOpen}
        editingEngine={editingEngine}
        clientName={client.name}
        onSubmit={handleEngineSubmit}
      />
    </div>
  );
}
