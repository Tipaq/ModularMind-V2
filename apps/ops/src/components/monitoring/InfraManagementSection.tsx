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

  const clearFeedback = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setState({ status: "idle" }), 3000);
  }, []);

  const handleClick = useCallback(async () => {
    if (state.status === "loading") return;

    // First click → confirm
    if (state.status !== "confirm") {
      setState({ status: "confirm" });
      // Auto-reset confirm after 4s
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setState({ status: "idle" }), 4000);
      return;
    }

    // Second click → execute
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setState({ status: "loading" });

    try {
      const result = await api.post<ActionResponse>(endpoint, body);
      setState({ status: "success", message: result.message ?? "Done" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Action failed";
      setState({ status: "error", message });
    }

    clearFeedback();
  }, [state.status, endpoint, body, clearFeedback]);

  const reset = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setState({ status: "idle" });
  }, []);

  return { state, handleClick, reset };
}

// ─── ActionButton ───────────────────────────────────────────────────────────

function ActionButton({
  label,
  icon: Icon,
  endpoint,
  body,
  destructive = false,
}: {
  label: string;
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
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          isConfirm
            ? "bg-warning text-warning-foreground"
            : destructive
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
        {isConfirm ? "Confirm?" : label}
      </button>

      {/* Inline feedback */}
      {(isSuccess || isError) && (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-sm animate-in fade-in",
            isSuccess ? "text-success" : "text-destructive",
          )}
        >
          {isSuccess ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          {state.message}
        </span>
      )}
    </div>
  );
}

// ─── Purge Queues ───────────────────────────────────────────────────────────

const PURGE_QUEUES = [
  { key: "executions", label: "Executions" },
  { key: "models", label: "Models" },
  { key: "memory", label: "Memory" },
  { key: "all", label: "All Streams" },
] as const;

// ─── Main Component ─────────────────────────────────────────────────────────

export function InfraManagementSection() {
  return (
    <div className="space-y-6">
      {/* Execution Control */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Execution Control
        </h3>
        <div className="space-y-3">
          <ActionButton
            label="Stop All Executions"
            icon={StopCircle}
            endpoint="/internal/actions/executions/stop-all"
            destructive
          />
        </div>
      </div>

      {/* Redis Management */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Redis Management
        </h3>
        <div className="space-y-3">
          <ActionButton
            label="Clean Redis State"
            icon={Database}
            endpoint="/internal/actions/redis/cleanup"
            destructive
          />
          <ActionButton
            label="Clean Scheduler Slots"
            icon={RefreshCw}
            endpoint="/internal/actions/scheduler/cleanup"
          />
        </div>

        {/* Purge Streams sub-group */}
        <div className="mt-2 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Purge Streams</p>
          <div className="flex flex-wrap gap-2">
            {PURGE_QUEUES.map(({ key, label }) => (
              <ActionButton
                key={key}
                label={`Purge ${label}`}
                icon={Trash2}
                endpoint="/internal/actions/streams/purge"
                body={{ queue: key }}
                destructive
              />
            ))}
          </div>
        </div>
      </div>

      {/* Worker */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Worker
        </h3>
        <div className="space-y-3">
          <ActionButton
            label="Restart Worker"
            icon={RefreshCw}
            endpoint="/internal/actions/worker/restart"
          />
        </div>
      </div>
    </div>
  );
}
