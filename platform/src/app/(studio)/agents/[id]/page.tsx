"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Bot,
  Copy,
  Edit,
  RefreshCw,
  Save,
  Shield,
  SlidersHorizontal,
  Terminal,
  Trash2,
  X,
  Brain,
  Database,
} from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Separator,
  Slider,
  Switch,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  DetailHeader,
} from "@modularmind/ui";
import Link from "next/link";
import { useAgentsStore } from "@/stores/agents";

function Section({
  icon: Icon,
  title,
  children,
  actions,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const agentId = params.id;

  const {
    selectedAgent: agent,
    loading,
    fetchAgent,
    updateAgent,
    deleteAgent,
    duplicateAgent,
  } = useAgentsStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    name: "",
    description: "",
    model: "",
    provider: "ollama",
    tags: [] as string[],
    system_prompt: "",
    timeout_seconds: 120,
    memory_enabled: false,
    rag_enabled: false,
    rag_retrieval_count: 5,
    rag_similarity_threshold: 0.7,
    gateway_enabled: false,
    gw_fs_read: "",
    gw_fs_write: "",
    gw_fs_deny: "",
    gw_shell_enabled: false,
    gw_shell_allow: "",
    gw_shell_deny: "",
    gw_shell_require_approval: true,
    gw_shell_timeout: 30,
    gw_browser_enabled: false,
    gw_browser_allow_urls: "",
    gw_browser_deny_urls: "",
    gw_browser_require_approval: true,
    gw_browser_timeout: 30,
    gw_net_enabled: false,
    gw_net_allow_domains: "",
    gw_net_deny_domains: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAgent(agentId);
  }, [agentId, fetchAgent]);

  const config = (agent?.config ?? {}) as Record<string, unknown>;

  const startEditing = () => {
    if (!agent) return;
    const gw = (config.gateway_permissions ?? {}) as Record<string, unknown>;
    const gwFs = (gw.filesystem ?? {}) as Record<string, unknown>;
    const gwSh = (gw.shell ?? {}) as Record<string, unknown>;
    const gwBr = (gw.browser ?? {}) as Record<string, unknown>;
    const gwNet = (gw.network ?? {}) as Record<string, unknown>;
    setEditValues({
      name: agent.name,
      description: agent.description || "",
      model: agent.model,
      provider: agent.provider,
      tags: agent.tags || [],
      system_prompt: (config.system_prompt as string) || "",
      timeout_seconds: (config.timeout_seconds as number) || 120,
      memory_enabled: (config.memory_enabled as boolean) || false,
      rag_enabled: (config.rag_enabled as boolean) || false,
      rag_retrieval_count: (config.rag_retrieval_count as number) || 5,
      rag_similarity_threshold: (config.rag_similarity_threshold as number) || 0.7,
      gateway_enabled: !!config.gateway_permissions,
      gw_fs_read: ((gwFs.read as string[]) || []).join(", "),
      gw_fs_write: ((gwFs.write as string[]) || []).join(", "),
      gw_fs_deny: ((gwFs.deny as string[]) || []).join(", "),
      gw_shell_enabled: (gwSh.enabled as boolean) || false,
      gw_shell_allow: ((gwSh.allow as string[]) || []).join(", "),
      gw_shell_deny: ((gwSh.deny as string[]) || []).join(", "),
      gw_shell_require_approval: gwSh.require_approval !== false,
      gw_shell_timeout: (gwSh.max_execution_seconds as number) || 30,
      gw_browser_enabled: (gwBr.enabled as boolean) || false,
      gw_browser_allow_urls: ((gwBr.allow_urls as string[]) || []).join(", "),
      gw_browser_deny_urls: ((gwBr.deny_urls as string[]) || []).join(", "),
      gw_browser_require_approval: gwBr.require_approval !== false,
      gw_browser_timeout: (gwBr.max_page_load_seconds as number) || 30,
      gw_net_enabled: (gwNet.enabled as boolean) || false,
      gw_net_allow_domains: ((gwNet.allow_domains as string[]) || []).join(", "),
      gw_net_deny_domains: ((gwNet.deny_domains as string[]) || []).join(", "),
    });
    setIsEditing(true);
  };

  const cancelEditing = () => setIsEditing(false);

  const splitPatterns = (s: string) =>
    s.split(",").map((p) => p.trim()).filter(Boolean);

  const handleSave = async () => {
    if (!agent) return;
    setSaving(true);
    try {
      const gatewayPermissions = editValues.gateway_enabled
        ? {
            filesystem: {
              read: splitPatterns(editValues.gw_fs_read),
              write: splitPatterns(editValues.gw_fs_write),
              deny: splitPatterns(editValues.gw_fs_deny),
            },
            shell: {
              enabled: editValues.gw_shell_enabled,
              allow: splitPatterns(editValues.gw_shell_allow),
              deny: splitPatterns(editValues.gw_shell_deny),
              require_approval: editValues.gw_shell_require_approval,
              max_execution_seconds: editValues.gw_shell_timeout,
            },
            browser: {
              enabled: editValues.gw_browser_enabled,
              allow_urls: splitPatterns(editValues.gw_browser_allow_urls),
              deny_urls: splitPatterns(editValues.gw_browser_deny_urls),
              require_approval: editValues.gw_browser_require_approval,
              max_page_load_seconds: editValues.gw_browser_timeout,
              headless_only: true,
            },
            network: {
              enabled: editValues.gw_net_enabled,
              allow_domains: splitPatterns(editValues.gw_net_allow_domains),
              deny_domains: splitPatterns(editValues.gw_net_deny_domains),
            },
          }
        : undefined;

      await updateAgent(agentId, {
        name: editValues.name,
        description: editValues.description,
        model: editValues.model,
        provider: editValues.provider,
        tags: editValues.tags,
        config: {
          ...config,
          system_prompt: editValues.system_prompt,
          timeout_seconds: editValues.timeout_seconds,
          memory_enabled: editValues.memory_enabled,
          rag_enabled: editValues.rag_enabled,
          rag_retrieval_count: editValues.rag_retrieval_count,
          rag_similarity_threshold: editValues.rag_similarity_threshold,
          gateway_permissions: gatewayPermissions,
        },
      });
      setIsEditing(false);
    } catch {
      // Error handled in store
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${agent?.name}"?`)) return;
    try {
      await deleteAgent(agentId);
      router.push("/agents");
    } catch {
      // Error handled in store
    }
  };

  const handleDuplicate = async () => {
    try {
      await duplicateAgent(agentId);
      router.push("/agents");
    } catch {
      // Error handled in store
    }
  };

  if (loading || !agent) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const systemPrompt = (config.system_prompt as string) || "";
  const timeoutSeconds = (config.timeout_seconds as number) || 120;
  const memoryEnabled = (config.memory_enabled as boolean) || false;
  const ragEnabled = (config.rag_enabled as boolean) || false;
  const ragRetrievalCount = (config.rag_retrieval_count as number) || 5;
  const ragSimilarityThreshold = (config.rag_similarity_threshold as number) || 0.7;
  const gatewayPerms = (config.gateway_permissions ?? null) as Record<string, unknown> | null;
  const gatewayEnabled = !!gatewayPerms;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <DetailHeader
        backHref="/agents"
        backLabel="Agents"
        renderLink={({ href, className, children }) => <Link href={href} className={className}>{children}</Link>}
        title={isEditing ? editValues.name : agent.name}
        isEditing={isEditing}
        onEditTitle={(v) => setEditValues((prev) => ({ ...prev, name: v }))}
        badges={
          <Badge variant="outline" className="font-mono text-xs">
            v{agent.version}
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
              <Button size="sm" variant="outline" onClick={handleDuplicate}>
                <Copy className="h-4 w-4 mr-1" />
                Duplicate
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

      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Left Panel */}
        <div className="w-full lg:w-[380px] overflow-y-auto lg:border-r border-border p-5 space-y-5">
          {/* Description */}
          <div>
            {isEditing ? (
              <textarea
                value={editValues.description}
                onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y min-h-[100px] placeholder:text-muted-foreground"
                rows={4}
                placeholder="Agent description..."
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {agent.description || "No description"}
              </p>
            )}
          </div>

          <Separator />

          {/* Configuration */}
          <Section icon={SlidersHorizontal} title="Configuration">
            <div className="space-y-1">
              <PropRow label="Model">
                {isEditing ? (
                  <Input
                    value={editValues.model}
                    onChange={(e) => setEditValues((prev) => ({ ...prev, model: e.target.value }))}
                    className="w-52 h-8 text-sm"
                    placeholder="model name"
                  />
                ) : (
                  <span className="text-sm font-medium">{agent.model}</span>
                )}
              </PropRow>

              <PropRow label="Provider">
                {isEditing ? (
                  <Select value={editValues.provider} onValueChange={(v) => setEditValues((prev) => ({ ...prev, provider: v }))}>
                    <SelectTrigger className="w-36 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ollama">Ollama</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                    {agent.provider}
                  </Badge>
                )}
              </PropRow>

              <PropRow label="Version">
                <span className="text-sm font-mono">v{agent.version}</span>
              </PropRow>

              <PropRow label="Timeout">
                {isEditing ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      value={editValues.timeout_seconds}
                      onChange={(e) => setEditValues((v) => ({ ...v, timeout_seconds: Number(e.target.value) }))}
                      className="w-20 h-8 text-sm"
                      min={10}
                      max={600}
                    />
                    <span className="text-xs text-muted-foreground">sec</span>
                  </div>
                ) : (
                  <span className="text-sm">{timeoutSeconds}s</span>
                )}
              </PropRow>
            </div>
          </Section>

          <Separator />

          {/* Memory */}
          <Section
            icon={Brain}
            title="Memory"
            actions={
              isEditing ? (
                <Switch
                  checked={editValues.memory_enabled}
                  onCheckedChange={(checked) => setEditValues((v) => ({ ...v, memory_enabled: checked }))}
                />
              ) : (
                <Badge variant={memoryEnabled ? "default" : "secondary"} className="text-[10px]">
                  {memoryEnabled ? "On" : "Off"}
                </Badge>
              )
            }
          >
            {(isEditing ? editValues.memory_enabled : memoryEnabled) ? (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Short-term and long-term memory is active. The agent retains context across conversations.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Enable memory to let the agent remember context across conversations.
              </p>
            )}
          </Section>

          <Separator />

          {/* RAG */}
          <Section
            icon={Database}
            title="RAG (Knowledge Base)"
            actions={
              isEditing ? (
                <Switch
                  checked={editValues.rag_enabled}
                  onCheckedChange={(checked) => setEditValues((v) => ({ ...v, rag_enabled: checked }))}
                />
              ) : (
                <Badge variant={ragEnabled ? "default" : "secondary"} className="text-[10px]">
                  {ragEnabled ? "On" : "Off"}
                </Badge>
              )
            }
          >
            {isEditing && editValues.rag_enabled ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  The agent will search the knowledge base for relevant context before responding.
                </p>
                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">Retrieved chunks (Top-K)</span>
                    <span className="text-xs font-mono">{editValues.rag_retrieval_count}</span>
                  </div>
                  <Slider
                    value={[editValues.rag_retrieval_count]}
                    onValueChange={([v]) => setEditValues((prev) => ({ ...prev, rag_retrieval_count: v }))}
                    min={1}
                    max={20}
                    step={1}
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">Similarity threshold</span>
                    <span className="text-xs font-mono">{editValues.rag_similarity_threshold.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[editValues.rag_similarity_threshold]}
                    onValueChange={([v]) => setEditValues((prev) => ({ ...prev, rag_similarity_threshold: v }))}
                    min={0}
                    max={1}
                    step={0.05}
                  />
                </div>
              </div>
            ) : (isEditing ? !editValues.rag_enabled : !ragEnabled) ? (
              <p className="text-xs text-muted-foreground">
                Enable RAG to augment responses with your document collections.
              </p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Knowledge base search is active.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
                    <p className="text-[10px] text-muted-foreground">Top-K</p>
                    <p className="text-sm font-medium">{ragRetrievalCount}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
                    <p className="text-[10px] text-muted-foreground">Threshold</p>
                    <p className="text-sm font-medium">{ragSimilarityThreshold}</p>
                  </div>
                </div>
              </div>
            )}
          </Section>

          <Separator />

          {/* Gateway (System Access) */}
          <Section
            icon={Terminal}
            title="Gateway (System Access)"
            actions={
              isEditing ? (
                <Switch
                  checked={editValues.gateway_enabled}
                  onCheckedChange={(checked) => setEditValues((v) => ({ ...v, gateway_enabled: checked }))}
                />
              ) : (
                <Badge variant={gatewayEnabled ? "default" : "secondary"} className="text-[10px]">
                  {gatewayEnabled ? "On" : "Off"}
                </Badge>
              )
            }
          >
            {isEditing && editValues.gateway_enabled ? (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Grant this agent system access — filesystem, shell, browser, and HTTP via the Gateway.
                </p>

                {/* Filesystem */}
                <div className="space-y-2">
                  <span className="text-xs font-medium">Filesystem</span>
                  <div className="space-y-1.5">
                    <div>
                      <label className="text-[11px] text-muted-foreground">Read patterns</label>
                      <Input
                        value={editValues.gw_fs_read}
                        onChange={(e) => setEditValues((v) => ({ ...v, gw_fs_read: e.target.value }))}
                        className="h-8 text-xs font-mono"
                        placeholder="/workspace/**"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Write patterns</label>
                      <Input
                        value={editValues.gw_fs_write}
                        onChange={(e) => setEditValues((v) => ({ ...v, gw_fs_write: e.target.value }))}
                        className="h-8 text-xs font-mono"
                        placeholder="/workspace/output/**"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Deny patterns</label>
                      <Input
                        value={editValues.gw_fs_deny}
                        onChange={(e) => setEditValues((v) => ({ ...v, gw_fs_deny: e.target.value }))}
                        className="h-8 text-xs font-mono"
                        placeholder="/workspace/.env, /workspace/**/.env"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Comma-separated glob patterns</p>
                </div>

                {/* Shell */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Shell</span>
                    <Switch
                      checked={editValues.gw_shell_enabled}
                      onCheckedChange={(checked) => setEditValues((v) => ({ ...v, gw_shell_enabled: checked }))}
                    />
                  </div>
                  {editValues.gw_shell_enabled && (
                    <div className="space-y-1.5">
                      <div>
                        <label className="text-[11px] text-muted-foreground">Allow patterns</label>
                        <Input
                          value={editValues.gw_shell_allow}
                          onChange={(e) => setEditValues((v) => ({ ...v, gw_shell_allow: e.target.value }))}
                          className="h-8 text-xs font-mono"
                          placeholder="ls *, cat *, echo *, python3 *"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">Deny patterns</label>
                        <Input
                          value={editValues.gw_shell_deny}
                          onChange={(e) => setEditValues((v) => ({ ...v, gw_shell_deny: e.target.value }))}
                          className="h-8 text-xs font-mono"
                          placeholder="rm -rf *, sudo *, chmod *"
                        />
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-muted-foreground">Require approval</span>
                        <Switch
                          checked={editValues.gw_shell_require_approval}
                          onCheckedChange={(checked) => setEditValues((v) => ({ ...v, gw_shell_require_approval: checked }))}
                        />
                      </div>
                      <PropRow label="Timeout">
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            value={editValues.gw_shell_timeout}
                            onChange={(e) => setEditValues((v) => ({ ...v, gw_shell_timeout: Number(e.target.value) }))}
                            className="w-20 h-8 text-sm"
                            min={5}
                            max={300}
                          />
                          <span className="text-xs text-muted-foreground">sec</span>
                        </div>
                      </PropRow>
                    </div>
                  )}
                </div>

                {/* Browser */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Browser</span>
                    <Switch
                      checked={editValues.gw_browser_enabled}
                      onCheckedChange={(checked) => setEditValues((v) => ({ ...v, gw_browser_enabled: checked }))}
                    />
                  </div>
                  {editValues.gw_browser_enabled && (
                    <div className="space-y-1.5">
                      <div>
                        <label className="text-[11px] text-muted-foreground">Allow URL patterns</label>
                        <Input
                          value={editValues.gw_browser_allow_urls}
                          onChange={(e) => setEditValues((v) => ({ ...v, gw_browser_allow_urls: e.target.value }))}
                          className="h-8 text-xs font-mono"
                          placeholder="https://docs.*, https://api.*"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">Deny URL patterns</label>
                        <Input
                          value={editValues.gw_browser_deny_urls}
                          onChange={(e) => setEditValues((v) => ({ ...v, gw_browser_deny_urls: e.target.value }))}
                          className="h-8 text-xs font-mono"
                          placeholder="*://localhost/*, *://127.0.0.1/*"
                        />
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-muted-foreground">Require approval</span>
                        <Switch
                          checked={editValues.gw_browser_require_approval}
                          onCheckedChange={(checked) => setEditValues((v) => ({ ...v, gw_browser_require_approval: checked }))}
                        />
                      </div>
                      <PropRow label="Page timeout">
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            value={editValues.gw_browser_timeout}
                            onChange={(e) => setEditValues((v) => ({ ...v, gw_browser_timeout: Number(e.target.value) }))}
                            className="w-20 h-8 text-sm"
                            min={5}
                            max={120}
                          />
                          <span className="text-xs text-muted-foreground">sec</span>
                        </div>
                      </PropRow>
                    </div>
                  )}
                </div>

                {/* Network */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Network (HTTP)</span>
                    <Switch
                      checked={editValues.gw_net_enabled}
                      onCheckedChange={(checked) => setEditValues((v) => ({ ...v, gw_net_enabled: checked }))}
                    />
                  </div>
                  {editValues.gw_net_enabled && (
                    <div className="space-y-1.5">
                      <div>
                        <label className="text-[11px] text-muted-foreground">Allow domains</label>
                        <Input
                          value={editValues.gw_net_allow_domains}
                          onChange={(e) => setEditValues((v) => ({ ...v, gw_net_allow_domains: e.target.value }))}
                          className="h-8 text-xs font-mono"
                          placeholder="api.github.com, *.openai.com"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">Deny domains</label>
                        <Input
                          value={editValues.gw_net_deny_domains}
                          onChange={(e) => setEditValues((v) => ({ ...v, gw_net_deny_domains: e.target.value }))}
                          className="h-8 text-xs font-mono"
                          placeholder="localhost, *.internal"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">Comma-separated domain patterns. SSRF protection is always active.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (isEditing ? !editValues.gateway_enabled : !gatewayEnabled) ? (
              <p className="text-xs text-muted-foreground">
                Enable to give this agent system access (filesystem, shell, browser, HTTP) via the Gateway.
              </p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">System access is active via Gateway sandbox.</p>
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    const fs = (gatewayPerms?.filesystem ?? {}) as Record<string, unknown>;
                    const sh = (gatewayPerms?.shell ?? {}) as Record<string, unknown>;
                    const br = (gatewayPerms?.browser ?? {}) as Record<string, unknown>;
                    const net = (gatewayPerms?.network ?? {}) as Record<string, unknown>;
                    const badges = [];
                    if ((fs.read as string[])?.length || (fs.write as string[])?.length)
                      badges.push(<Badge key="fs" variant="outline" className="text-[10px]">Filesystem</Badge>);
                    if (sh.enabled)
                      badges.push(<Badge key="sh" variant="outline" className="text-[10px]">Shell</Badge>);
                    if (br.enabled)
                      badges.push(<Badge key="br" variant="outline" className="text-[10px]">Browser</Badge>);
                    if (net.enabled)
                      badges.push(<Badge key="net" variant="outline" className="text-[10px]">Network</Badge>);
                    return badges.length ? badges : <span className="text-[10px] text-muted-foreground">No categories configured</span>;
                  })()}
                </div>
              </div>
            )}
          </Section>

          <Separator />

          {/* System Prompt */}
          <Section icon={Shield} title="System Prompt">
            {isEditing ? (
              <textarea
                value={editValues.system_prompt}
                onChange={(e) => setEditValues((v) => ({ ...v, system_prompt: e.target.value }))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono resize-y min-h-[200px] placeholder:text-muted-foreground"
                rows={10}
                placeholder="Enter a system prompt..."
              />
            ) : (
              <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm max-h-[300px] overflow-y-auto leading-relaxed">
                {systemPrompt || "No system prompt configured"}
              </pre>
            )}
          </Section>
        </div>

        {/* Right Panel — Playground placeholder */}
        <div className="flex-1 min-w-0 h-full overflow-hidden flex items-center justify-center bg-muted/20">
          <div className="text-center text-muted-foreground">
            <Bot className="mx-auto h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">Playground coming soon</p>
            <p className="text-xs mt-1">Test this agent with real-time conversations</p>
          </div>
        </div>
      </div>
    </div>
  );
}
