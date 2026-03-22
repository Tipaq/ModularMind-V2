import { RefreshCw, Clock, Hand } from "lucide-react";
import {
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@modularmind/ui";
import type { ScheduleType, IntervalUnit } from "@modularmind/api-client";

interface ScheduleSectionProps {
  scheduleType: ScheduleType;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  startAt: string;
  scheduledDate: string;
  scheduledTime: string;
  onScheduleTypeChange: (type: ScheduleType) => void;
  onIntervalValueChange: (value: number) => void;
  onIntervalUnitChange: (unit: IntervalUnit) => void;
  onStartAtChange: (startAt: string) => void;
  onScheduledDateChange: (date: string) => void;
  onScheduledTimeChange: (time: string) => void;
}

const SCHEDULE_OPTIONS = [
  { value: "interval" as const, icon: RefreshCw, label: "Repeat", description: "Fixed interval" },
  { value: "one_shot" as const, icon: Clock, label: "Run once", description: "Specific date & time" },
  { value: "manual" as const, icon: Hand, label: "Manual", description: "On demand or via API" },
];

const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const min = i * 5;
  return { value: `00:${String(min).padStart(2, "0")}`, label: String(min).padStart(2, "0") };
});

function ScheduleTypeCards({
  scheduleType,
  onScheduleTypeChange,
}: Pick<ScheduleSectionProps, "scheduleType" | "onScheduleTypeChange">) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {SCHEDULE_OPTIONS.map(({ value, icon: Icon, label, description }) => {
        const isSelected = scheduleType === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onScheduleTypeChange(value)}
            className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left text-sm transition-colors cursor-pointer ${
              isSelected
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/50"
            }`}
          >
            <Icon className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
            <span className="font-medium">{label}</span>
            <span className="text-xs text-muted-foreground">{description}</span>
          </button>
        );
      })}
    </div>
  );
}

function IntervalFields({
  intervalValue,
  intervalUnit,
  startAt,
  onIntervalValueChange,
  onIntervalUnitChange,
  onStartAtChange,
}: Pick<
  ScheduleSectionProps,
  "intervalValue" | "intervalUnit" | "startAt" | "onIntervalValueChange" | "onIntervalUnitChange" | "onStartAtChange"
>) {
  const showAnchorTime = intervalUnit === "hours" || intervalUnit === "days";

  return (
    <div className="flex items-center gap-2 pt-3 flex-wrap">
      <span className="text-sm text-muted-foreground">Every</span>
      <Input
        type="number"
        value={intervalValue}
        onChange={(e) => onIntervalValueChange(Number(e.target.value))}
        className="w-20"
        min={1}
      />
      <Select value={intervalUnit} onValueChange={(v) => onIntervalUnitChange(v as IntervalUnit)}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="minutes">Minutes</SelectItem>
          <SelectItem value="hours">Hours</SelectItem>
          <SelectItem value="days">Days</SelectItem>
        </SelectContent>
      </Select>
      {showAnchorTime && intervalUnit === "hours" && (
        <>
          <span className="text-sm text-muted-foreground">at minute</span>
          <Select value={startAt || "00:00"} onValueChange={onStartAtChange}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MINUTE_OPTIONS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}
      {showAnchorTime && intervalUnit === "days" && (
        <>
          <span className="text-sm text-muted-foreground">at</span>
          <Input
            type="time"
            value={startAt}
            onChange={(e) => onStartAtChange(e.target.value)}
            className="w-28"
          />
        </>
      )}
    </div>
  );
}

function OneShotFields({
  scheduledDate,
  scheduledTime,
  onScheduledDateChange,
  onScheduledTimeChange,
}: Pick<ScheduleSectionProps, "scheduledDate" | "scheduledTime" | "onScheduledDateChange" | "onScheduledTimeChange">) {
  return (
    <div className="grid grid-cols-2 gap-3 pt-3">
      <Input
        label="Date"
        type="date"
        value={scheduledDate}
        onChange={(e) => onScheduledDateChange(e.target.value)}
      />
      <Input
        label="Time"
        type="time"
        value={scheduledTime}
        onChange={(e) => onScheduledTimeChange(e.target.value)}
      />
    </div>
  );
}

function ScheduleSection(props: ScheduleSectionProps) {
  return (
    <div className="space-y-0">
      <ScheduleTypeCards
        scheduleType={props.scheduleType}
        onScheduleTypeChange={props.onScheduleTypeChange}
      />
      {props.scheduleType === "interval" && (
        <IntervalFields
          intervalValue={props.intervalValue}
          intervalUnit={props.intervalUnit}
          startAt={props.startAt}
          onIntervalValueChange={props.onIntervalValueChange}
          onIntervalUnitChange={props.onIntervalUnitChange}
          onStartAtChange={props.onStartAtChange}
        />
      )}
      {props.scheduleType === "one_shot" && (
        <OneShotFields
          scheduledDate={props.scheduledDate}
          scheduledTime={props.scheduledTime}
          onScheduledDateChange={props.onScheduledDateChange}
          onScheduledTimeChange={props.onScheduledTimeChange}
        />
      )}
      {props.scheduleType === "manual" && (
        <p className="text-xs text-muted-foreground pt-3">
          This task will only run when triggered manually or via API.
        </p>
      )}
    </div>
  );
}

export { ScheduleSection };
