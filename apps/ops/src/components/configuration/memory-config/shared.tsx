import {
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Slider,
  Switch,
} from "@modularmind/ui";

// ── Field Components ─────────────────────────────────────────────

export function NumberField({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step,
  unit,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <Label className="text-sm">{label}</Label>
        {description && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          className="w-24 text-right tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || min || 0)}
        />
        {unit && (
          <span className="text-xs text-muted-foreground w-8">{unit}</span>
        )}
      </div>
    </div>
  );
}

export function SliderField({
  label,
  description,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm">{label}</Label>
          {description && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        <span className="text-sm font-mono tabular-nums w-12 text-right">
          {value.toFixed(2)}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        className="w-full"
      />
    </div>
  );
}

export function SwitchField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <Label className="text-sm">{label}</Label>
        {description && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ── Section Header ───────────────────────────────────────────────

export function SectionHeader({
  icon: Icon,
  title,
  description,
  right,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  right?: React.ReactNode;
}) {
  return (
    <CardHeader className="pb-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <CardTitle className="text-sm">{title}</CardTitle>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      <CardDescription className="text-xs">{description}</CardDescription>
    </CardHeader>
  );
}
