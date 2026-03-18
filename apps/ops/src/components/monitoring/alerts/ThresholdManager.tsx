"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Settings, XCircle } from "lucide-react";
import { cn } from "@modularmind/ui";
import type { ThresholdConfig, ThresholdUpdate } from "@modularmind/api-client";
import { api } from "../../../lib/api";

interface ThresholdFieldProps {
  label: string;
  description: string;
  value: number;
  unit: string;
  onChange: (value: number) => void;
}

function ThresholdField({ label, description, value, unit, onChange }: ThresholdFieldProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground w-8">{unit}</span>
      </div>
    </div>
  );
}

export function ThresholdManager() {
  const [config, setConfig] = useState<ThresholdConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const fetchThresholds = async () => {
      try {
        const result = await api.get<ThresholdConfig>("/alerts/thresholds");
        setConfig(result);
      } catch {
        // endpoint may not be available
      } finally {
        setLoading(false);
      }
    };
    fetchThresholds();
  }, []);

  const updateField = (field: keyof ThresholdConfig, value: number | boolean) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
    setDirty(true);
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!config || !dirty) return;
    setSaving(true);
    setFeedback(null);

    try {
      const update: ThresholdUpdate = {
        cpu_percent: config.cpu_percent,
        memory_percent: config.memory_percent,
        workers_min: config.workers_min,
        dlq_max: config.dlq_max,
        queue_depth_max: config.queue_depth_max,
        enabled: config.enabled,
      };
      const result = await api.put<ThresholdConfig>("/alerts/thresholds", update);
      setConfig(result);
      setDirty(false);
      setFeedback({ type: "success", message: "Thresholds updated" });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save";
      setFeedback({ type: "error", message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-sm text-muted-foreground">
        Loading threshold configuration...
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-sm text-muted-foreground">
        Alert thresholds not available.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          Alert Thresholds
        </h3>
        <div className="flex items-center gap-3">
          {/* Enabled toggle */}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => updateField("enabled", e.target.checked)}
              className="rounded border-border"
            />
            Alerts enabled
          </label>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium transition-colors",
              dirty
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground",
              "disabled:opacity-50",
            )}
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Save
          </button>

          {/* Feedback */}
          {feedback && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-xs",
                feedback.type === "success" ? "text-success" : "text-destructive",
              )}
            >
              {feedback.type === "success" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              {feedback.message}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border/50 bg-card/50 px-5">
        <ThresholdField
          label="CPU"
          description="Alert when CPU usage exceeds this percentage"
          value={config.cpu_percent}
          unit="%"
          onChange={(v) => updateField("cpu_percent", v)}
        />
        <ThresholdField
          label="Memory"
          description="Alert when memory usage exceeds this percentage"
          value={config.memory_percent}
          unit="%"
          onChange={(v) => updateField("memory_percent", v)}
        />
        <ThresholdField
          label="Min Workers"
          description="Alert when active workers fall below this count"
          value={config.workers_min}
          unit=""
          onChange={(v) => updateField("workers_min", v)}
        />
        <ThresholdField
          label="DLQ Max"
          description="Alert when dead letter queue exceeds this count"
          value={config.dlq_max}
          unit="msgs"
          onChange={(v) => updateField("dlq_max", v)}
        />
        <ThresholdField
          label="Queue Depth"
          description="Alert when total queue depth exceeds this count"
          value={config.queue_depth_max}
          unit="msgs"
          onChange={(v) => updateField("queue_depth_max", v)}
        />
      </div>
    </div>
  );
}
