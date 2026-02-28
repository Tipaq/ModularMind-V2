"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "../theme/useTheme";
import { PRESETS } from "../theme/presets";
import { cn } from "../lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { Paintbrush, X } from "lucide-react";

interface ThemeCustomizerProps {
  className?: string;
}

export function ThemeCustomizer({ className }: ThemeCustomizerProps) {
  const { hue, saturation, preset, setPreset, setAccent } = useTheme();
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Mode toggle */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Mode
        </p>
        <ThemeToggle variant="segmented" />
      </div>

      {/* Accent colors */}
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

          {/* Custom button */}
          <button
            onClick={() => setShowPicker(true)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
              preset === "custom"
                ? "border-foreground scale-110"
                : "border-border hover:scale-105 hover:border-muted-foreground",
            )}
            style={
              preset === "custom"
                ? { backgroundColor: `hsl(${hue} ${saturation}% 55%)` }
                : undefined
            }
            title="Custom color"
            aria-label="Custom accent color"
          >
            <Paintbrush
              className={cn(
                "h-3.5 w-3.5",
                preset === "custom" ? "text-white" : "text-muted-foreground",
              )}
            />
          </button>
        </div>
      </div>

      {/* Color picker modal */}
      {showPicker && (
        <ColorPickerModal
          hue={hue}
          saturation={saturation}
          onAccentChange={setAccent}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

/* ---------- Color Picker Modal ---------- */

interface ColorPickerModalProps {
  hue: number;
  saturation: number;
  onAccentChange: (hue: number, saturation: number) => void;
  onClose: () => void;
}

function ColorPickerModal({ hue, saturation, onAccentChange, onClose }: ColorPickerModalProps) {
  const [localHue, setLocalHue] = useState(hue);
  const [localSat, setLocalSat] = useState(saturation);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Draw the color wheel
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const radius = center - 4;

    ctx.clearRect(0, 0, size, size);

    // Draw hue ring (red at top, clockwise)
    for (let hue = 0; hue < 360; hue++) {
      const canvasAngle = hue - 90; // offset so hue 0 (red) is at 12 o'clock
      const startAngle = ((canvasAngle - 1) * Math.PI) / 180;
      const endAngle = ((canvasAngle + 1) * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.arc(center, center, radius - 28, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = `hsl(${hue} ${localSat}% 55%)`;
      ctx.fill();
    }

    // Draw indicator on the ring
    const indicatorAngle = ((localHue - 90) * Math.PI) / 180;
    const indicatorRadius = radius - 14;
    const ix = center + Math.cos(indicatorAngle) * indicatorRadius;
    const iy = center + Math.sin(indicatorAngle) * indicatorRadius;

    ctx.beginPath();
    ctx.arc(ix, iy, 10, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${localHue} ${localSat}% 55%)`;
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [localHue, localSat]);

  // Handle canvas click/drag
  const handleCanvasInteraction = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - canvas.width / 2;
      const y = e.clientY - rect.top - canvas.height / 2;
      const angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
      const newHue = Math.round(((angle % 360) + 360) % 360);
      setLocalHue(newHue);
    },
    [],
  );

  const [isDragging, setIsDragging] = useState(false);

  const handleApply = () => {
    onAccentChange(localHue, localSat);
    onClose();
  };

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-lg border">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Custom Accent Color</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Color wheel */}
        <div className="flex justify-center mb-4">
          <canvas
            ref={canvasRef}
            width={220}
            height={220}
            className="cursor-crosshair"
            onClick={handleCanvasInteraction}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onMouseMove={(e) => {
              if (isDragging) handleCanvasInteraction(e);
            }}
          />
        </div>

        {/* Saturation slider */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Saturation: {localSat}%
          </label>
          <input
            type="range"
            min={20}
            max={100}
            value={localSat}
            onChange={(e) => setLocalSat(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right,
                hsl(${localHue} 20% 55%), hsl(${localHue} 60% 55%), hsl(${localHue} 100% 55%))`,
            }}
          />
        </div>

        {/* Preview + actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 rounded-full border"
              style={{ backgroundColor: `hsl(${localHue} ${localSat}% 55%)` }}
            />
            <span className="text-sm text-muted-foreground">Preview</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
