import { useState } from "react";
import {
  Clock,
  SlidersHorizontal,
  Target,
  Settings2,
  ArrowRight,
  Save,
  X,
  Edit,
  Plus,
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
} from "@modularmind/ui";
import type { ScheduledTask } from "@modularmind/api-client";

interface ScheduledTaskConfigTabProps {
  task: ScheduledTask;
  onSave: (data: Partial<ScheduledTask>) => Promise<void>;
}

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

export function ScheduledTaskConfigTab({ task, onSave }: ScheduledTaskConfigTabProps) {
  const config = task.config || {};
  const trigger = config.trigger || {};
  const triage = config.triage || {};
  const execution = config.execution || {};
  const postActions = config.post_actions || [];
  const settings = config.settings || {};

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editValues, setEditValues] = useState({
    name: task.name,
    description: task.description,
    trigger_type: trigger.type || "cron",
    trigger_interval: trigger.interval_seconds || 3600,
    trigger_source: trigger.source || "github_pr",
    trigger_token_ref: trigger.github_token_ref || "GITHUB_TOKEN",
    trigger_repos: (trigger.repos || []).join(", "),
    triage_enabled: triage.enabled !== false,
    triage_max_files: triage.simple_threshold?.max_files || 10,
    triage_max_lines: triage.simple_threshold?.max_lines || 500,
    exec_agent_id: execution.agent_id || "",
    exec_graph_id: execution.graph_id || "",
    exec_timeout: execution.timeout_seconds || 600,
    post_actions: (postActions || []).map((pa) => ({
      type: pa.type,
      on: pa.on,
      method: pa.method,
      url: pa.url,
    })),
    dry_run: settings.dry_run !== false,
    max_per_cycle: settings.max_per_cycle || 5,
    skip_labels: (settings.skip_labels || []).join(", "),
    require_labels: (settings.require_labels || []).join(", "),
    branches: (settings.branches || ["main"]).join(", "),
  });

  const startEditing = () => setIsEditing(true);
  const cancelEditing = () => setIsEditing(false);

  const splitList = (s: string) =>
    s.split(",").map((p) => p.trim()).filter(Boolean);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        name: editValues.name,
        description: editValues.description,
        config: {
          trigger: {
            type: editValues.trigger_type as "cron" | "manual",
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
            agent_id: editValues.exec_agent_id || null,
            graph_id: editValues.exec_graph_id || null,
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
    } finally {
      setSaving(false);
    }
  };

  const addPostAction = () => {
    setEditValues((v) => ({
      ...v,
      post_actions: [...v.post_actions, { type: "github_comment", on: "always" as const }],
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

  return (
    <div className="p-5 space-y-5">
      <div className="flex justify-end gap-2">
        {isEditing ? (
          <>
            <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={saving}>
              <X className="h-4 w-4 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save"}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={startEditing}>
            <Edit className="h-4 w-4 mr-1" /> Edit
          </Button>
        )}
      </div>

      {/* Trigger */}
      <Section icon={Clock} title="Trigger">
        {isEditing ? (
          <div className="space-y-2">
            <PropRow label="Type">
              <Select
                value={editValues.trigger_type}
                onValueChange={(v) => setEditValues((prev) => ({ ...prev, trigger_type: v }))}
              >
                <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cron">Cron</SelectItem>
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
                <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
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
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <PropRow label="Type">
              <Badge variant="outline" className="text-[10px]">{trigger.type || "Not set"}</Badge>
            </PropRow>
            <PropRow label="Source">
              <Badge variant="outline" className="text-[10px]">{trigger.source || "Not set"}</Badge>
            </PropRow>
            {!!trigger.interval_seconds && (
              <PropRow label="Interval">
                <span className="text-sm">{trigger.interval_seconds}s</span>
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
            <PropRow label="Max files">
              <Input type="number" value={editValues.triage_max_files}
                onChange={(e) => setEditValues((v) => ({ ...v, triage_max_files: Number(e.target.value) }))}
                className="w-20 h-8 text-sm" min={1} max={100}
              />
            </PropRow>
            <PropRow label="Max lines">
              <Input type="number" value={editValues.triage_max_lines}
                onChange={(e) => setEditValues((v) => ({ ...v, triage_max_lines: Number(e.target.value) }))}
                className="w-20 h-8 text-sm" min={10} max={5000}
              />
            </PropRow>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {triage.enabled !== false ? "Classifying items by complexity." : "Triage is disabled."}
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
              <Input value={editValues.exec_agent_id}
                onChange={(e) => setEditValues((v) => ({ ...v, exec_agent_id: e.target.value }))}
                className="h-8 text-xs font-mono" placeholder="Agent ID"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Graph ID</label>
              <Input value={editValues.exec_graph_id}
                onChange={(e) => setEditValues((v) => ({ ...v, exec_graph_id: e.target.value }))}
                className="h-8 text-xs font-mono" placeholder="Graph ID"
              />
            </div>
            <PropRow label="Timeout">
              <div className="flex items-center gap-1.5">
                <Input type="number" value={editValues.exec_timeout}
                  onChange={(e) => setEditValues((v) => ({ ...v, exec_timeout: Number(e.target.value) }))}
                  className="w-24 h-8 text-sm" min={30} max={3600}
                />
                <span className="text-xs text-muted-foreground">sec</span>
              </div>
            </PropRow>
          </div>
        ) : (
          <div className="space-y-1">
            {execution.agent_id && <PropRow label="Agent"><span className="text-xs font-mono">{execution.agent_id}</span></PropRow>}
            {execution.graph_id && <PropRow label="Graph"><span className="text-xs font-mono">{execution.graph_id}</span></PropRow>}
            <PropRow label="Timeout"><span className="text-sm">{execution.timeout_seconds || 600}s</span></PropRow>
          </div>
        )}
      </Section>

      <Separator />

      {/* Post-Actions */}
      <Section
        icon={ArrowRight}
        title="Post-Actions"
        actions={isEditing ? (
          <Button size="sm" variant="outline" onClick={addPostAction} className="h-6 text-xs px-2">
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        ) : undefined}
      >
        {isEditing ? (
          <div className="space-y-3">
            {editValues.post_actions.length === 0 && (
              <p className="text-xs text-muted-foreground">No post-actions configured.</p>
            )}
            {editValues.post_actions.map((pa, i) => (
              <div key={i} className="rounded-md border p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Select value={pa.type} onValueChange={(v) => updatePostAction(i, "type", v)}>
                    <SelectTrigger className="w-40 h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {POST_ACTION_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive"
                    onClick={() => removePostAction(i)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <PropRow label="Run on">
                  <Select value={pa.on} onValueChange={(v) => updatePostAction(i, "on", v)}>
                    <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="always">Always</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="failure">Failure</SelectItem>
                    </SelectContent>
                  </Select>
                </PropRow>
                {pa.type === "github_merge" && (
                  <PropRow label="Method">
                    <Select value={pa.method || "squash"} onValueChange={(v) => updatePostAction(i, "method", v)}>
                      <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MERGE_METHODS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </PropRow>
                )}
                {pa.type === "webhook" && (
                  <div>
                    <label className="text-[11px] text-muted-foreground">Webhook URL</label>
                    <Input value={pa.url || ""} onChange={(e) => updatePostAction(i, "url", e.target.value)}
                      className="h-7 text-xs font-mono" placeholder="https://example.com/hook"
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
                  <Badge variant="outline" className="text-[10px]">{pa.type}</Badge>
                  <span className="text-[10px] text-muted-foreground">on {pa.on}</span>
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
              <Switch checked={editValues.dry_run}
                onCheckedChange={(checked) => setEditValues((v) => ({ ...v, dry_run: checked }))}
              />
            </div>
            <PropRow label="Max per cycle">
              <Input type="number" value={editValues.max_per_cycle}
                onChange={(e) => setEditValues((v) => ({ ...v, max_per_cycle: Number(e.target.value) }))}
                className="w-20 h-8 text-sm" min={1} max={50}
              />
            </PropRow>
            <div>
              <label className="text-[11px] text-muted-foreground">Skip labels</label>
              <Input value={editValues.skip_labels}
                onChange={(e) => setEditValues((v) => ({ ...v, skip_labels: e.target.value }))}
                className="h-8 text-xs font-mono" placeholder="no-auto-review, wip"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Target branches</label>
              <Input value={editValues.branches}
                onChange={(e) => setEditValues((v) => ({ ...v, branches: e.target.value }))}
                className="h-8 text-xs font-mono" placeholder="main, develop"
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
              <span className="text-sm">{settings.max_per_cycle || 5}</span>
            </PropRow>
          </div>
        )}
      </Section>
    </div>
  );
}
