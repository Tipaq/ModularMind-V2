import { useTheme } from "../theme/useTheme";
import { PRESETS } from "../theme/presets";
import { cn } from "../lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { Paintbrush } from "lucide-react";

interface ThemeCustomizerProps {
  className?: string;
}

export function ThemeCustomizer({ className }: ThemeCustomizerProps) {
  const { hue, saturation, preset, setPreset, setAccent } = useTheme();

  return (
    <div className={cn("space-y-4", className)}>
      {/* Mode toggle */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Mode
        </p>
        <ThemeToggle variant="segmented" />
      </div>

      {/* Preset colors */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Accent Color
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => setPreset(p.name)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                preset === p.name
                  ? "border-foreground scale-110"
                  : "border-transparent hover:scale-105",
              )}
              style={{
                backgroundColor: `hsl(${p.hue} ${p.saturation}% 55%)`,
              }}
              title={p.label}
              aria-label={`${p.label} theme`}
            />
          ))}
          {/* Custom indicator */}
          {preset === "custom" && (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-foreground scale-110"
              style={{
                backgroundColor: `hsl(${hue} ${saturation}% 55%)`,
              }}
            >
              <Paintbrush className="h-3.5 w-3.5 text-white" />
            </div>
          )}
        </div>
      </div>

      {/* Custom hue slider */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Custom Hue
        </p>
        <input
          type="range"
          min={0}
          max={360}
          value={hue}
          onChange={(e) => setAccent(Number(e.target.value), saturation)}
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right,
              hsl(0 80% 55%), hsl(60 80% 55%), hsl(120 80% 55%),
              hsl(180 80% 55%), hsl(240 80% 55%), hsl(300 80% 55%), hsl(360 80% 55%))`,
          }}
          aria-label="Custom hue"
        />
        <div className="mt-1 flex items-center gap-2">
          <div
            className="h-4 w-4 rounded-full"
            style={{ backgroundColor: `hsl(${hue} ${saturation}% 55%)` }}
          />
          <span className="text-xs text-muted-foreground">
            Hue: {hue} / Saturation: {saturation}%
          </span>
        </div>
      </div>

      {/* Saturation slider */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Saturation
        </p>
        <input
          type="range"
          min={20}
          max={100}
          value={saturation}
          onChange={(e) => setAccent(hue, Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer bg-muted"
          aria-label="Custom saturation"
        />
      </div>
    </div>
  );
}
