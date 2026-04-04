import { useState, useEffect } from "react";
import { CalendarClock, Target, MessageSquare } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Textarea,
  Separator,
} from "@modularmind/ui";
import type {
  ScheduledTask,
  ScheduleType,
  IntervalUnit,
  TargetType,
  Agent,
  GraphListItem,
} from "@modularmind/api-client";
import { api } from "@modularmind/api-client";
import { useScheduledTasksStore } from "../../stores/scheduled-tasks";
import { ScheduleSection } from "./ScheduleSection";
import { TargetSection } from "./TargetSection";

interface CreateScheduledTaskDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (task: ScheduledTask) => void;
}

interface TaskForm {
  name: string;
  description: string;
  scheduleType: ScheduleType;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  startAt: string;
  scheduledDate: string;
  scheduledTime: string;
  targetType: TargetType;
  targetId: string;
  inputText: string;
}

const INITIAL_FORM: TaskForm = {
  name: "",
  description: "",
  scheduleType: "manual",
  intervalValue: 1,
  intervalUnit: "hours",
  startAt: "00:00",
  scheduledDate: "",
  scheduledTime: "",
  targetType: "agent",
  targetId: "",
  inputText: "",
};

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {title}
    </div>
  );
}

function buildPayload(form: TaskForm): Partial<ScheduledTask> & { name: string } {
  const payload: Record<string, unknown> = {
    name: form.name,
    description: form.description,
    enabled: true,
    schedule_type: form.scheduleType,
    target_type: form.targetType,
    target_id: form.targetId || undefined,
    input_text: form.inputText,
  };
  if (form.scheduleType === "interval") {
    payload.interval_value = form.intervalValue;
    payload.interval_unit = form.intervalUnit;
    if (form.startAt && (form.intervalUnit === "hours" || form.intervalUnit === "days")) {
      payload.start_at = form.startAt;
    }
  }
  if (form.scheduleType === "one_shot" && form.scheduledDate && form.scheduledTime) {
    payload.scheduled_at = `${form.scheduledDate}T${form.scheduledTime}`;
  }
  return payload as Partial<ScheduledTask> & { name: string };
}

function CreateScheduledTaskDialog({ isOpen, onOpenChange, onCreated }: CreateScheduledTaskDialogProps) {
  const { createTask } = useScheduledTasksStore();
  const [form, setForm] = useState<TaskForm>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [graphs, setGraphs] = useState<GraphListItem[]>([]);
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(INITIAL_FORM);
    setIsLoadingTargets(true);
    Promise.all([
      api.get<{ items: Agent[] }>("/agents").catch(() => ({ items: [] as Agent[] })),
      api.get<{ items: GraphListItem[] }>("/graphs").catch(() => ({ items: [] as GraphListItem[] })),
    ])
      .then(([agentRes, graphRes]) => {
        setAgents(agentRes.items);
        setGraphs(graphRes.items);
      })
      .finally(() => setIsLoadingTargets(false));
  }, [isOpen]);

  const updateForm = (partial: Partial<TaskForm>) => setForm((prev) => ({ ...prev, ...partial }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const task = await createTask(buildPayload(form));
      onOpenChange(false);
      onCreated(task);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New Scheduled Task</DialogTitle>
          <DialogDescription>Define what to run and when.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-1">
          <div className="space-y-3">
            <Input
              label="Task name"
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
              placeholder="e.g., Issue Review Pipeline"
              required
            />
            <Input
              label="Description"
              value={form.description}
              onChange={(e) => updateForm({ description: e.target.value })}
              placeholder="e.g., Review GitHub issues every hour"
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <SectionHeader icon={CalendarClock} title="When to run" />
            <ScheduleSection
              scheduleType={form.scheduleType}
              intervalValue={form.intervalValue}
              intervalUnit={form.intervalUnit}
              startAt={form.startAt}
              scheduledDate={form.scheduledDate}
              scheduledTime={form.scheduledTime}
              onScheduleTypeChange={(v) => updateForm({ scheduleType: v })}
              onIntervalValueChange={(v) => updateForm({ intervalValue: v })}
              onIntervalUnitChange={(v) => updateForm({ intervalUnit: v })}
              onStartAtChange={(v) => updateForm({ startAt: v })}
              onScheduledDateChange={(v) => updateForm({ scheduledDate: v })}
              onScheduledTimeChange={(v) => updateForm({ scheduledTime: v })}
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <SectionHeader icon={Target} title="What to run" />
            <TargetSection
              targetType={form.targetType}
              targetId={form.targetId}
              agents={agents}
              graphs={graphs}
              isLoadingTargets={isLoadingTargets}
              onTargetTypeChange={(v) => updateForm({ targetType: v })}
              onTargetIdChange={(v) => updateForm({ targetId: v })}
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <SectionHeader icon={MessageSquare} title="Instruction" />
            <Textarea
              value={form.inputText}
              onChange={(e) => updateForm({ inputText: e.target.value })}
              placeholder="What should the agent/graph do?"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating || !form.name.trim()}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { CreateScheduledTaskDialog };
