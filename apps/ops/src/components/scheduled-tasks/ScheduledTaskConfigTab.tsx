import { useState } from "react";
import {
  CalendarClock,
  Target,
  MessageSquare,
  Settings2,
  Save,
  X,
  Edit,
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
import type { ScheduledTask, ScheduleType, IntervalUnit, TargetType } from "@modularmind/api-client";

interface ScheduledTaskConfigTabProps {
  task: ScheduledTask;
  onSave: (data: Partial<ScheduledTask>) => Promise<void>;
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        <Icon className="h-3.5 w-3.5" />
        {title}
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

export function ScheduledTaskConfigTab({ task, onSave }: ScheduledTaskConfigTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const settings = task.config?.settings || {};

  const [editValues, setEditValues] = useState({
    name: task.name,
    description: task.description,
    schedule_type: task.schedule_type as ScheduleType,
    interval_value: task.interval_value || 1,
    interval_unit: (task.interval_unit || "hours") as IntervalUnit,
    scheduled_at: task.scheduled_at || "",
    start_at: task.start_at || "00:00",
    target_type: task.target_type as TargetType,
    target_id: task.target_id || "",
    input_text: task.input_text || "",
    dry_run: settings.dry_run !== false,
    max_per_cycle: (settings.max_per_cycle as number) || 5,
  });

  const startEditing = () => setIsEditing(true);
  const cancelEditing = () => setIsEditing(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        name: editValues.name,
        description: editValues.description,
        schedule_type: editValues.schedule_type,
        interval_value: editValues.schedule_type === "interval" ? editValues.interval_value : null,
        interval_unit: editValues.schedule_type === "interval" ? editValues.interval_unit : null,
        scheduled_at: editValues.schedule_type === "one_shot" ? editValues.scheduled_at : null,
        start_at: editValues.schedule_type === "interval" ? editValues.start_at : null,
        target_type: editValues.target_type,
        target_id: editValues.target_id || null,
        input_text: editValues.input_text,
        config: {
          ...task.config,
          settings: {
            ...(task.config?.settings || {}),
            dry_run: editValues.dry_run,
            max_per_cycle: editValues.max_per_cycle,
          },
        },
      });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
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

      {/* Schedule */}
      <Section icon={CalendarClock} title="Schedule">
        {isEditing ? (
          <div className="space-y-3">
            <PropRow label="Type">
              <Select
                value={editValues.schedule_type}
                onValueChange={(v) => setEditValues((prev) => ({ ...prev, schedule_type: v as ScheduleType }))}
              >
                <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="interval">Interval</SelectItem>
                  <SelectItem value="one_shot">One-shot</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </PropRow>
            {editValues.schedule_type === "interval" && (
              <>
                <PropRow label="Every">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={editValues.interval_value}
                      onChange={(e) => setEditValues((v) => ({ ...v, interval_value: Number(e.target.value) }))}
                      className="w-20 h-8 text-sm"
                      min={1}
                    />
                    <Select
                      value={editValues.interval_unit}
                      onValueChange={(v) => setEditValues((prev) => ({ ...prev, interval_unit: v as IntervalUnit }))}
                    >
                      <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minutes">Minutes</SelectItem>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </PropRow>
                {(editValues.interval_unit === "hours" || editValues.interval_unit === "days") && (
                  <PropRow label="Starting at">
                    <Input
                      type="time"
                      value={editValues.start_at}
                      onChange={(e) => setEditValues((v) => ({ ...v, start_at: e.target.value }))}
                      className="w-32 h-8 text-sm"
                    />
                  </PropRow>
                )}
              </>
            )}
            {editValues.schedule_type === "one_shot" && (
              <PropRow label="Run at">
                <Input
                  type="datetime-local"
                  value={typeof editValues.scheduled_at === "string" ? editValues.scheduled_at.slice(0, 16) : ""}
                  onChange={(e) => setEditValues((v) => ({ ...v, scheduled_at: e.target.value }))}
                  className="w-52 h-8 text-sm"
                />
              </PropRow>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <PropRow label="Type">
              <Badge variant="outline" className="text-[10px]">{task.schedule_type}</Badge>
            </PropRow>
            {task.schedule_type === "interval" && (
              <>
                <PropRow label="Every">
                  <span className="text-sm">
                    {task.interval_value} {task.interval_unit}
                  </span>
                </PropRow>
                {task.start_at && (
                  <PropRow label="Starting at">
                    <span className="text-sm">{task.start_at}</span>
                  </PropRow>
                )}
              </>
            )}
            {task.schedule_type === "one_shot" && task.scheduled_at && (
              <PropRow label="Run at">
                <span className="text-sm">{new Date(task.scheduled_at.endsWith("Z") ? task.scheduled_at : `${task.scheduled_at}Z`).toLocaleString()}</span>
              </PropRow>
            )}
          </div>
        )}
      </Section>

      <Separator />

      {/* Target */}
      <Section icon={Target} title="Execution Target">
        {isEditing ? (
          <div className="space-y-3">
            <PropRow label="Type">
              <Select
                value={editValues.target_type}
                onValueChange={(v) => setEditValues((prev) => ({ ...prev, target_type: v as TargetType }))}
              >
                <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="graph">Graph</SelectItem>
                </SelectContent>
              </Select>
            </PropRow>
            <div>
              <label className="text-[11px] text-muted-foreground">Target ID</label>
              <Input
                value={editValues.target_id}
                onChange={(e) => setEditValues((v) => ({ ...v, target_id: e.target.value }))}
                className="h-8 text-xs font-mono"
                placeholder="Agent or Graph ID"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <PropRow label="Type">
              <Badge variant="outline" className="text-[10px]">{task.target_type}</Badge>
            </PropRow>
            <PropRow label="ID">
              <span className="text-xs font-mono">{task.target_id || "Not set"}</span>
            </PropRow>
          </div>
        )}
      </Section>

      <Separator />

      {/* Input Text */}
      <Section icon={MessageSquare} title="Instruction">
        {isEditing ? (
          <textarea
            value={editValues.input_text}
            onChange={(e) => setEditValues((v) => ({ ...v, input_text: e.target.value }))}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y min-h-[80px] placeholder:text-muted-foreground"
            rows={3}
            placeholder="What should the agent/graph do?"
          />
        ) : (
          <p className="text-sm text-muted-foreground bg-muted/30 rounded p-3">
            {task.input_text || "No instruction set"}
          </p>
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
                onChange={(e) => setEditValues((v) => ({ ...v, max_per_cycle: Number(e.target.value) }))}
                className="w-20 h-8 text-sm"
                min={1}
                max={50}
              />
            </PropRow>
          </div>
        ) : (
          <div className="space-y-1">
            <PropRow label="Dry run">
              <Badge
                variant={settings.dry_run !== false ? "default" : "secondary"}
                className="text-[10px]"
              >
                {settings.dry_run !== false ? "On" : "Off"}
              </Badge>
            </PropRow>
            <PropRow label="Max per cycle">
              <span className="text-sm">{(settings.max_per_cycle as number) || 5}</span>
            </PropRow>
          </div>
        )}
      </Section>
    </div>
  );
}
