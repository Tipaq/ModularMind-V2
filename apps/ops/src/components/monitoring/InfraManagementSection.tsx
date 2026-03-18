"use client";

import { useState, useCallback, useRef } from "react";
import { cn } from "@modularmind/ui";
import {
  Trash2,
  StopCircle,
  RefreshCw,
  Database,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { api } from "../../lib/api";

// ─── Types ──────────────────────────────────────────────────────────────────

type ActionStatus = "idle" | "confirm" | "loading" | "success" | "error";

interface ActionFeedback {
  status: ActionStatus;
  message?: string;
}

type ActionResponse = { status: string; message: string; details?: Record<string, unknown> };

// ─── useAction hook ─────────────────────────────────────────────────────────

function useAction(endpoint: string, body?: Record<string, unknown>) {
  const [state, setState] = useState<ActionFeedback>({ status: "idle" });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyJson = body ? JSON.stringify(body) : undefined;

  const clearFeedback = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setState({ status: "idle" }), 3000);
  }, []);

  const handleClick = useCallback(async () => {
    if (state.status === "loading") return;

    // First click → confirm
    if (state.status !== "confirm") {
      setState({ status: "confirm" });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setState({ status: "idle" }), 4000);
      return;
    }

    // Second click → execute
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setState({ status: "loading" });

    try {
      const result = await api.post<ActionResponse>(endpoint, bodyJson ? JSON.parse(bodyJson) : undefined);
      setState({ status: "success", message: result.message ?? "Done" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Action failed";
      setState({ status: "error", message });
    }

    clearFeedback();
  }, [state.status, endpoint, bodyJson, clearFeedback]);

  const reset = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setState({ status: "idle" });
  }, []);

  return { state, handleClick, reset };
}

// ─── ActionCard ─────────────────────────────────────────────────────────────

function ActionCard({
  label,
  description,
  icon: Icon,
  endpoint,
  body,
  destructive = false,
}: {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  endpoint: string;
  body?: Record<string, unknown>;
  destructive?: boolean;
}) {
  const { state, handleClick } = useAction(endpoint, body);

  const isConfirm = state.status === "confirm";
  const isLoading = state.status === "loading";
  const isSuccess = state.status === "success";
  const isError = state.status === "error";

  return (
    <div className={cn(
      "rounded-xl border p-4 transition-colors",
      isConfirm
        ? "border-warning/40 bg-warning/5"
        : destructive
          ? "border-destructive/20 bg-card/50"
          : "border-border/50 bg-card/50",
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn(
            "rounded-lg p-2 shrink-0",
            destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
          )}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClick}
          disabled={isLoading}
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:pointer-events-none disabled:opacity-50",
            isConfirm
              ? "bg-warning text-warning-foreground"
              : destructive
                ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                : "bg-primary/10 text-primary hover:bg-primary/20",
          )}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Icon className="h-3.5 w-3.5" />
          )}
          {isConfirm ? "Confirm?" : "Run"}
        </button>
      </div>

      {/* Feedback */}
      {(isSuccess || isError) && (
        <div className={cn(
          "mt-3 flex items-center gap-1.5 text-xs",
          isSuccess ? "text-success" : "text-destructive",
        )}>
          {isSuccess ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          {state.message}
        </div>
      )}
    </div>
  );
}

// ─── Purge Queues ───────────────────────────────────────────────────────────

const PURGE_QUEUES = [
  { key: "executions", label: "Executions", desc: "Clear execution task queue" },
  { key: "models", label: "Models", desc: "Clear model task queue" },
  { key: "memory", label: "Memory", desc: "Clear memory pipeline" },
  { key: "all", label: "All Streams", desc: "Purge every Redis stream" },
] as const;

// ─── Main Component ─────────────────────────────────────────────────────────

export function InfraManagementSection() {
  return (
    <div className="space-y-6">
      {/* Safe Operations */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Operations</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <ActionCard
            label="Restart Worker"
            description="Gracefully restart the background worker process"
            icon={RefreshCw}
            endpoint="/internal/actions/worker/restart"
          />
          <ActionCard
            label="Clean Scheduler Slots"
            description="Release stale scheduler slots to unblock capacity"
            icon={RefreshCw}
            endpoint="/internal/actions/scheduler/cleanup"
          />
          <ActionCard
            label="Reload Config"
            description="Pull latest configuration from Platform"
            icon={RefreshCw}
            endpoint="/internal/actions/sync/reload"
          />
        </div>
      </div>

      {/* Danger Zone */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          <p className="text-xs font-semibold text-destructive uppercase tracking-wider">Danger Zone</p>
        </div>
        <div className="rounded-xl border border-destructive/20 p-4 space-y-3">
          <ActionCard
            label="Stop All Executions"
            description="Force-stop every running and pending execution"
            icon={StopCircle}
            endpoint="/internal/actions/executions/stop-all"
            destructive
          />
          <ActionCard
            label="Clean Redis State"
            description="Remove all ephemeral state from Redis (locks, caches, sessions)"
            icon={Database}
            endpoint="/internal/actions/redis/cleanup"
            destructive
          />

          {/* Purge streams */}
          <div className="pt-2 border-t border-destructive/10">
            <p className="text-xs font-medium text-muted-foreground mb-3">Purge Streams</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PURGE_QUEUES.map(({ key, label, desc }) => (
                <ActionCard
                  key={key}
                  label={`Purge ${label}`}
                  description={desc}
                  icon={Trash2}
                  endpoint="/internal/actions/streams/purge"
                  body={{ queue: key }}
                  destructive
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
