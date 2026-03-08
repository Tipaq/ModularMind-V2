"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Copy,
  Edit,
  Play,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Trash2,
  X,
  Clock,
  GitPullRequest,
  Target,
  Settings2,
  ArrowRight,
} from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Separator,
  Switch,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  DetailHeader,
} from "@modularmind/ui";
import Link from "next/link";
import { useAutomationsStore } from "@/stores/automations";

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

const POST_ACTION_TYPES = [
  { value: "github_comment", label: "GitHub Comment" },
  { value: "github_commit", label: "GitHub Commit" },
  { value: "github_merge", label: "GitHub Merge" },
  { value: "webhook", label: "Webhook" },
];

const MERGE_METHODS = [
  { value: "squash", label: "Squash" },
  { value: "merge", label: "Merge" },
  { value: "rebase", label: "Rebase" },
];

export default function AutomationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const automationId = params.id;

  const {
    selectedAutomation: automation,
    loading,
    fetchAutomation,
    updateAutomation,
    deleteAutomation,
    duplicateAutomation,
    toggleAutomation,
    triggerAutomation,
  } = useAutomationsStore();

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);

  // Edit state — flattened for form inputs
  const [editValues, setEditValues] = useState({
    name: "",
    description: "",
    // Trigger
    trigger_type: "cron",
    trigger_interval: 3600,
    trigger_source: "github_pr",
    trigger_token_ref: "GITHUB_TOKEN",
    trigger_repos: "",
    // Triage
    triage_enabled: true,
    triage_max_files: 10,
    triage_max_lines: 500,
    // Execution
    exec_agent_id: "",
    exec_graph_id: "",
    exec_timeout: 600,
    // Post-actions
    post_actions: [] as Array<{ type: string; on: string; method?: string; url?: string }>,
    // Settings
    dry_run: true,
    max_per_cycle: 5,
    skip_labels: "",
    require_labels: "",
    branches: "main",
  });

  useEffect(() => {
    fetchAutomation(automationId);
  }, [automationId, fetchAutomation]);

  const config = (automation?.config ?? {}) as Record<string, unknown>;
  const trigger = (config.trigger ?? {}) as Record<string, unknown>;
  const triage = (config.triage ?? {}) as Record<string, unknown>;
  const execution = (config.execution ?? {}) as Record<string, unknown>;
  const postActions = (config.post_actions ?? []) as Array<Record<string, unknown>>;
  const settings = (config.settings ?? {}) as Record<string, unknown>;

  const startEditing = () => {
    if (!automation) return;
    const triageThreshold = (triage.simple_threshold ?? {}) as Record<string, unknown>;
    setEditValues({
      name: automation.name,
      description: automation.description || "",
      trigger_type: (trigger.type as string) || "cron",
      trigger_interval: (trigger.interval_seconds as number) || 3600,
      trigger_source: (trigger.source as string) || "github_pr",
      trigger_token_ref: (trigger.github_token_ref as string) || "GITHUB_TOKEN",
      trigger_repos: ((trigger.repos as string[]) || []).join(", "),
      triage_enabled: triage.enabled !== false,
      triage_max_files: (triageThreshold.max_files as number) || 10,
      triage_max_lines: (triageThreshold.max_lines as number) || 500,
      exec_agent_id: (execution.agent_id as string) || "",
      exec_graph_id: (execution.graph_id as string) || "",
      exec_timeout: (execution.timeout_seconds as number) || 600,
      post_actions: postActions.map((pa) => ({
        type: pa.type as string,
        on: pa.on as string,
        method: pa.method as string | undefined,
        url: pa.url as string | undefined,
      })),
      dry_run: settings.dry_run !== false,
      max_per_cycle: (settings.max_per_cycle as number) || 5,
      skip_labels: ((settings.skip_labels as string[]) || []).join(", "),
      require_labels: ((settings.require_labels as string[]) || []).join(", "),
      branches: ((settings.branches as string[]) || ["main"]).join(", "),
    });
    setIsEditing(true);
  };

  const cancelEditing = () => setIsEditing(false);

  const splitList = (s: string) =>
    s.split(",").map((p) => p.trim()).filter(Boolean);

  const handleSave = async () => {
    if (!automation) return;
    setSaving(true);
    try {
      await updateAutomation(automationId, {
        name: editValues.name,
        description: editValues.description,
        config: {
          trigger: {
            type: editValues.trigger_type,
            interval_seconds: editValues.trigger_interval,
            source: editValues.trigger_source,
            github_token_ref: editValues.trigger_token_ref,
            repos: splitList(editValues.trigger_repos),
          },
          triage: {
            enabled: editValues.triage_enabled,
            simple_threshold: {
              max_files: editValues.triage_max_files,
              max_lines: editValues.triage_max_lines,
            },
          },
          execution: {
            agent_id: editValues.exec_agent_id || undefined,
            graph_id: editValues.exec_graph_id || undefined,
            timeout_seconds: editValues.exec_timeout,
          },
          post_actions: editValues.post_actions,
          settings: {
            dry_run: editValues.dry_run,
            max_per_cycle: editValues.max_per_cycle,
            skip_labels: splitList(editValues.skip_labels),
            require_labels: splitList(editValues.require_labels),
            branches: splitList(editValues.branches),
          },
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
    if (!confirm(`Are you sure you want to delete "${automation?.name}"?`)) return;
    try {
      await deleteAutomation(automationId);
      router.push("/automations");
    } catch {
      // Error handled in store
    }
  };

  const handleDuplicate = async () => {
    try {
      await duplicateAutomation(automationId);
      router.push("/automations");
    } catch {
      // Error handled in store
    }
  };

  const handleTrigger = async () => {
    if (!automation?.enabled) return;
    setTriggering(true);
    try {
      await triggerAutomation(automationId);
    } catch {
      // Error handled in store
    } finally {
      setTriggering(false);
    }
  };

  const addPostAction = () => {
    setEditValues((v) => ({
      ...v,
      post_actions: [...v.post_actions, { type: "github_comment", on: "always" }],
    }));
  };

  const removePostAction = (index: number) => {
    setEditValues((v) => ({
      ...v,
      post_actions: v.post_actions.filter((_, i) => i !== index),
    }));
  };

  const updatePostAction = (index: number, field: string, value: string) => {
    setEditValues((v) => ({
      ...v,
      post_actions: v.post_actions.map((pa, i) =>
        i === index ? { ...pa, [field]: value } : pa,
      ),
    }));
  };

  if (loading || !automation) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <DetailHeader
        backHref="/automations"
        backLabel="Automations"
        renderLink={({ href, className, children }) => (
          <Link href={href} className={className}>{children}</Link>
        )}
        title={isEditing ? editValues.name : automation.name}
        isEditing={isEditing}
        onEditTitle={(v) => setEditValues((prev) => ({ ...prev, name: v }))}
        badges={
          <>
            <Badge variant="outline" className="font-mono text-xs">
              v{automation.version}
            </Badge>
            <Badge variant={automation.enabled ? "default" : "secondary"} className="text-xs">
              {automation.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </>
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
              {automation.enabled && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTrigger}
                  disabled={triggering}
                >
                  <Play className="h-4 w-4 mr-1" />
                  {triggering ? "Triggering..." : "Run Now"}
                </Button>
              )}
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
        {/* Left Panel — Config */}
        <div className="w-full lg:w-[420px] overflow-y-auto lg:border-r border-border p-5 space-y-5">
          {/* Description */}
          <div>
            {isEditing ? (
              <textarea
                value={editValues.description}
                onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y min-h-[80px] placeholder:text-muted-foreground"
                rows={3}
                placeholder="Automation description..."
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {automation.description || "No description"}
              </p>
            )}
          </div>

          <Separator />

          {/* Enabled toggle */}
          {!isEditing && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Enabled</span>
                <Switch
                  checked={automation.enabled}
                  onCheckedChange={(checked) => toggleAutomation(automation.id, checked)}
                />
              </div>
              <Separator />
            </>
          )}

          {/* Trigger */}
          <Section icon={Clock} title="Trigger">
            {isEditing ? (
              <div className="space-y-2">
                <PropRow label="Type">
                  <Select
                    value={editValues.trigger_type}
                    onValueChange={(v) => setEditValues((prev) => ({ ...prev, trigger_type: v }))}
                  >
                    <SelectTrigger className="w-32 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cron">Cron</SelectItem>
                      <SelectItem value="webhook">Webhook</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </PropRow>
                {editValues.trigger_type === "cron" && (
                  <PropRow label="Interval">
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        value={editValues.trigger_interval}
                        onChange={(e) =>
                          setEditValues((v) => ({ ...v, trigger_interval: Number(e.target.value) }))
                        }
                        className="w-24 h-8 text-sm"
                        min={60}
                        max={86400}
                      />
                      <span className="text-xs text-muted-foreground">sec</span>
                    </div>
                  </PropRow>
                )}
                <PropRow label="Source">
                  <Select
                    value={editValues.trigger_source}
                    onValueChange={(v) => setEditValues((prev) => ({ ...prev, trigger_source: v }))}
                  >
                    <SelectTrigger className="w-36 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="github_pr">GitHub PR</SelectItem>
                      <SelectItem value="github_issue">GitHub Issue</SelectItem>
                    </SelectContent>
                  </Select>
                </PropRow>
                <div>
                  <label className="text-[11px] text-muted-foreground">Token env var</label>
                  <Input
                    value={editValues.trigger_token_ref}
                    onChange={(e) => setEditValues((v) => ({ ...v, trigger_token_ref: e.target.value }))}
                    className="h-8 text-xs font-mono"
                    placeholder="GITHUB_TOKEN"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Repositories</label>
                  <Input
                    value={editValues.trigger_repos}
                    onChange={(e) => setEditValues((v) => ({ ...v, trigger_repos: e.target.value }))}
                    className="h-8 text-xs font-mono"
                    placeholder="owner/repo1, owner/repo2"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Comma-separated owner/repo</p>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <PropRow label="Type">
                  <Badge variant="outline" className="text-[10px]">
                    {(trigger.type as string) || "Not set"}
                  </Badge>
                </PropRow>
                <PropRow label="Source">
                  <Badge variant="outline" className="text-[10px]">
                    {(trigger.source as string) || "Not set"}
                  </Badge>
                </PropRow>
                {!!trigger.interval_seconds && (
                  <PropRow label="Interval">
                    <span className="text-sm">{trigger.interval_seconds as number}s</span>
                  </PropRow>
                )}
                {(trigger.repos as string[])?.length > 0 && (
                  <PropRow label="Repos">
                    <span className="text-xs font-mono">
                      {(trigger.repos as string[]).join(", ")}
                    </span>
                  </PropRow>
                )}
              </div>
            )}
          </Section>

          <Separator />

          {/* Triage */}
          <Section
            icon={Target}
            title="Triage"
            actions={
              isEditing ? (
                <Switch
                  checked={editValues.triage_enabled}
                  onCheckedChange={(checked) => setEditValues((v) => ({ ...v, triage_enabled: checked }))}
                />
              ) : (
                <Badge variant={triage.enabled !== false ? "default" : "secondary"} className="text-[10px]">
                  {triage.enabled !== false ? "On" : "Off"}
                </Badge>
              )
            }
          >
            {isEditing && editValues.triage_enabled ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Classify items as simple or complex based on thresholds.
                </p>
                <PropRow label="Max files (simple)">
                  <Input
                    type="number"
                    value={editValues.triage_max_files}
                    onChange={(e) =>
                      setEditValues((v) => ({ ...v, triage_max_files: Number(e.target.value) }))
                    }
                    className="w-20 h-8 text-sm"
                    min={1}
                    max={100}
                  />
                </PropRow>
                <PropRow label="Max lines (simple)">
                  <Input
                    type="number"
                    value={editValues.triage_max_lines}
                    onChange={(e) =>
                      setEditValues((v) => ({ ...v, triage_max_lines: Number(e.target.value) }))
                    }
                    className="w-20 h-8 text-sm"
                    min={10}
                    max={5000}
                  />
                </PropRow>
              </div>
            ) : !isEditing && triage.enabled !== false ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-muted-foreground">Max files</p>
                  <p className="text-sm font-medium">
                    {((triage.simple_threshold as Record<string, unknown>)?.max_files as number) || 10}
                  </p>
                </div>
                <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-muted-foreground">Max lines</p>
                  <p className="text-sm font-medium">
                    {((triage.simple_threshold as Record<string, unknown>)?.max_lines as number) || 500}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {isEditing ? "Enable triage to classify items by complexity." : "Triage is disabled."}
              </p>
            )}
          </Section>

          <Separator />

          {/* Execution */}
          <Section icon={SlidersHorizontal} title="Execution">
            {isEditing ? (
              <div className="space-y-2">
                <div>
                  <label className="text-[11px] text-muted-foreground">Agent ID</label>
                  <Input
                    value={editValues.exec_agent_id}
                    onChange={(e) => setEditValues((v) => ({ ...v, exec_agent_id: e.target.value }))}
                    className="h-8 text-xs font-mono"
                    placeholder="Agent ID (for simple items)"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Graph ID</label>
                  <Input
                    value={editValues.exec_graph_id}
                    onChange={(e) => setEditValues((v) => ({ ...v, exec_graph_id: e.target.value }))}
                    className="h-8 text-xs font-mono"
                    placeholder="Graph ID (for complex items)"
                  />
                </div>
                <PropRow label="Timeout">
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      value={editValues.exec_timeout}
                      onChange={(e) =>
                        setEditValues((v) => ({ ...v, exec_timeout: Number(e.target.value) }))
                      }
                      className="w-24 h-8 text-sm"
                      min={30}
                      max={3600}
                    />
                    <span className="text-xs text-muted-foreground">sec</span>
                  </div>
                </PropRow>
              </div>
            ) : (
              <div className="space-y-1">
                {!!execution.agent_id && (
                  <PropRow label="Agent">
                    <span className="text-xs font-mono">{execution.agent_id as string}</span>
                  </PropRow>
                )}
                {!!execution.graph_id && (
                  <PropRow label="Graph">
                    <span className="text-xs font-mono">{execution.graph_id as string}</span>
                  </PropRow>
                )}
                <PropRow label="Timeout">
                  <span className="text-sm">{(execution.timeout_seconds as number) || 600}s</span>
                </PropRow>
                {!execution.agent_id && !execution.graph_id && (
                  <p className="text-xs text-muted-foreground">No execution target configured.</p>
                )}
              </div>
            )}
          </Section>

          <Separator />

          {/* Post-Actions */}
          <Section
            icon={ArrowRight}
            title="Post-Actions"
            actions={
              isEditing ? (
                <Button size="sm" variant="outline" onClick={addPostAction} className="h-6 text-xs px-2">
                  + Add
                </Button>
              ) : undefined
            }
          >
            {isEditing ? (
              <div className="space-y-3">
                {editValues.post_actions.length === 0 && (
                  <p className="text-xs text-muted-foreground">No post-actions configured.</p>
                )}
                {editValues.post_actions.map((pa, i) => (
                  <div key={i} className="rounded-md border p-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Select
                        value={pa.type}
                        onValueChange={(v) => updatePostAction(i, "type", v)}
                      >
                        <SelectTrigger className="w-40 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {POST_ACTION_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-destructive"
                        onClick={() => removePostAction(i)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <PropRow label="Run on">
                      <Select
                        value={pa.on}
                        onValueChange={(v) => updatePostAction(i, "on", v)}
                      >
                        <SelectTrigger className="w-28 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="always">Always</SelectItem>
                          <SelectItem value="success">Success</SelectItem>
                          <SelectItem value="failure">Failure</SelectItem>
                        </SelectContent>
                      </Select>
                    </PropRow>
                    {pa.type === "github_merge" && (
                      <PropRow label="Method">
                        <Select
                          value={pa.method || "squash"}
                          onValueChange={(v) => updatePostAction(i, "method", v)}
                        >
                          <SelectTrigger className="w-28 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MERGE_METHODS.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </PropRow>
                    )}
                    {pa.type === "webhook" && (
                      <div>
                        <label className="text-[11px] text-muted-foreground">Webhook URL</label>
                        <Input
                          value={pa.url || ""}
                          onChange={(e) => updatePostAction(i, "url", e.target.value)}
                          className="h-7 text-xs font-mono"
                          placeholder="https://deploy.example.com/hook"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {postActions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No post-actions configured.</p>
                ) : (
                  postActions.map((pa, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {pa.type as string}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        on {pa.on as string}
                      </span>
                      {!!pa.method && (
                        <span className="text-[10px] text-muted-foreground">
                          ({pa.method as string})
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </Section>

          <Separator />

          {/* Settings */}
          <Section icon={Settings2} title="Settings">
            {isEditing ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-muted-foreground">Dry run</span>
                  <Switch
                    checked={editValues.dry_run}
                    onCheckedChange={(checked) => setEditValues((v) => ({ ...v, dry_run: checked }))}
                  />
                </div>
                <PropRow label="Max per cycle">
                  <Input
                    type="number"
                    value={editValues.max_per_cycle}
                    onChange={(e) =>
                      setEditValues((v) => ({ ...v, max_per_cycle: Number(e.target.value) }))
                    }
                    className="w-20 h-8 text-sm"
                    min={1}
                    max={50}
                  />
                </PropRow>
                <div>
                  <label className="text-[11px] text-muted-foreground">Skip labels</label>
                  <Input
                    value={editValues.skip_labels}
                    onChange={(e) => setEditValues((v) => ({ ...v, skip_labels: e.target.value }))}
                    className="h-8 text-xs font-mono"
                    placeholder="no-auto-review, wip"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Require labels</label>
                  <Input
                    value={editValues.require_labels}
                    onChange={(e) => setEditValues((v) => ({ ...v, require_labels: e.target.value }))}
                    className="h-8 text-xs font-mono"
                    placeholder="auto-review"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Target branches</label>
                  <Input
                    value={editValues.branches}
                    onChange={(e) => setEditValues((v) => ({ ...v, branches: e.target.value }))}
                    className="h-8 text-xs font-mono"
                    placeholder="main, develop"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <PropRow label="Dry run">
                  <Badge variant={settings.dry_run !== false ? "default" : "secondary"} className="text-[10px]">
                    {settings.dry_run !== false ? "On" : "Off"}
                  </Badge>
                </PropRow>
                <PropRow label="Max per cycle">
                  <span className="text-sm">{(settings.max_per_cycle as number) || 5}</span>
                </PropRow>
                {((settings.branches as string[])?.length ?? 0) > 0 && (
                  <PropRow label="Branches">
                    <span className="text-xs font-mono">
                      {(settings.branches as string[]).join(", ")}
                    </span>
                  </PropRow>
                )}
              </div>
            )}
          </Section>
        </div>

        {/* Right Panel — Run History placeholder */}
        <div className="flex-1 min-w-0 h-full overflow-hidden flex items-center justify-center bg-muted/20">
          <div className="text-center text-muted-foreground">
            <GitPullRequest className="mx-auto h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">Run History</p>
            <p className="text-xs mt-1">Execution history will appear here once the engine is connected</p>
          </div>
        </div>
      </div>
    </div>
  );
}
