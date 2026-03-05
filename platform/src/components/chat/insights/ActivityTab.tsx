"use client";

import { useState } from "react";
import {
  Bot,
  Activity,
  Wrench,
  FileJson,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Badge, cn } from "@modularmind/ui";
import type { ExecutionActivity } from "@/hooks/useChat";
import { ExecutionActivityList } from "@modularmind/ui";
import { ToolCallCard } from "../ToolCallCard";

// ── Types ────────────────────────────────────────────────────

export interface ActivityTabProps {
  activities: ExecutionActivity[];
  isStreaming: boolean;
  tokenUsage: { prompt: number; completion: number; total: number } | null;
  activeAgent: { name: string; isEphemeral?: boolean; status: string } | null;
  toolCalls: ExecutionActivity[];
  steps: ExecutionActivity[];
}

// ── Shared: Collapsible Section ──────────────────────────────

function CollapsibleSection({
  title,
  icon: Icon,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ElementType;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex-1">
          {title}
        </span>
        {badge && (
          <Badge variant="secondary" className="text-[10px] h-4">
            {badge}
          </Badge>
        )}
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <Icon className="h-5 w-5 mb-2 opacity-30" />
      <p className="text-xs text-center px-4">{message}</p>
    </div>
  );
}

// ── Step Card ────────────────────────────────────────────────

function StepCard({ step }: { step: ExecutionActivity }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
      >
        <Badge
          variant={step.status === "running" ? "default" : step.status === "failed" ? "destructive" : "secondary"}
          className="text-[10px]"
        >
          {step.status}
        </Badge>
        <span className="text-xs font-medium truncate flex-1">{step.label}</span>
        {step.durationMs != null && (
          <span className="text-[10px] text-muted-foreground">
            {step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {expanded && step.preview && (
        <div className="border-t border-border/50 px-3 py-2">
          <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-words">
            {step.preview}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Activity Tab Content ─────────────────────────────────────

export function ActivityTab({
  activities,
  isStreaming,
  tokenUsage,
  activeAgent,
  toolCalls,
  steps,
}: ActivityTabProps) {
  if (!activities.length && !tokenUsage) {
    return <EmptyState icon={Activity} message="Send a message to see execution activity." />;
  }

  return (
    <div className="p-4 space-y-3">
      {/* Token Usage */}
      {tokenUsage && (
        <div className="border border-border/50 rounded-lg p-2.5">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">Tokens:</span>
            <span className="font-mono">{tokenUsage.prompt}</span>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="font-mono">{tokenUsage.completion}</span>
            <span className="text-muted-foreground">=</span>
            <span className="font-mono font-medium">{tokenUsage.total}</span>
          </div>
        </div>
      )}

      {/* Active Agent */}
      {activeAgent && (
        <div className="border border-border/50 rounded-lg p-2.5">
          <div className="flex items-center gap-2">
            <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium flex-1">{activeAgent.name}</span>
            {activeAgent.isEphemeral && (
              <Badge variant="outline" className="text-[10px]">ephemeral</Badge>
            )}
            <Badge
              variant={activeAgent.status === "running" ? "default" : "secondary"}
              className="text-[10px]"
            >
              {activeAgent.status}
            </Badge>
          </div>
        </div>
      )}

      {/* Activity Stream */}
      {activities.length > 0 && (
        <ExecutionActivityList
          activities={activities}
          isStreaming={isStreaming}
          flat
        />
      )}

      {/* Tool Calls */}
      {toolCalls.length > 0 && (
        <CollapsibleSection title="Tool Calls" icon={Wrench} defaultOpen={true} badge={`${toolCalls.length}`}>
          <div className="space-y-2">
            {toolCalls.map((tc) => (
              <ToolCallCard
                key={tc.id}
                toolData={tc.toolData!}
                status={tc.status}
                durationMs={tc.durationMs}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Steps */}
      {steps.length > 0 && (
        <CollapsibleSection title="Steps" icon={FileJson} badge={`${steps.length}`}>
          <div className="space-y-2">
            {steps.map((step) => (
              <StepCard key={step.id} step={step} />
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
