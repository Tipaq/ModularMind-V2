"use client";

import { memo, useState } from "react";
import { ShieldCheck, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

export interface ApprovalOption {
  label: string;
  value: string;
  variant?: "approve" | "reject" | "neutral";
}

const DEFAULT_OPTIONS: ApprovalOption[] = [
  { label: "Approve", value: "approved", variant: "approve" },
  { label: "Reject", value: "rejected", variant: "reject" },
];

export interface ApprovalRequest {
  executionId: string;
  nodeId: string;
  message: string;
  plan: string;
  timeoutSeconds: number;
  approvalType?: "graph" | "gateway";
  approvalId?: string;
  toolName?: string;
  argsPreview?: string;
  options?: ApprovalOption[];
}

export interface ApprovalCardProps {
  approval: ApprovalRequest;
  onApprove: (executionId: string) => Promise<void>;
  onReject: (executionId: string) => Promise<void>;
  decision?: "approved" | "rejected" | null;
}

export const ApprovalCard = memo(function ApprovalCard({
  approval,
  onApprove,
  onReject,
  decision,
}: ApprovalCardProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [resolved, setResolved] = useState<string | null>(decision ?? null);

  const options = approval.options ?? DEFAULT_OPTIONS;

  const handleSelect = async (option: ApprovalOption) => {
    setLoading(option.value);
    try {
      if (option.variant === "reject" || option.value === "rejected") {
        await onReject(approval.executionId);
      } else {
        await onApprove(approval.executionId);
      }
      setResolved(option.value);
    } finally {
      setLoading(null);
    }
  };

  if (resolved) {
    const isApproved = resolved === "approved" || resolved !== "rejected";
    const selectedLabel = options.find((o) => o.value === resolved)?.label ?? resolved;
    return (
      <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isApproved ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
          )}
          <span className="line-clamp-1">{approval.message}</span>
          <span className="ml-auto text-[10px] font-medium whitespace-nowrap">
            {selectedLabel}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 text-warning mt-0.5 shrink-0" />
        <p className="text-sm font-medium">{approval.message}</p>
      </div>

      {approval.approvalType === "gateway" && approval.argsPreview && (
        <div className="ml-6">
          <pre className="rounded-md bg-muted/60 border border-border/50 px-3 py-2 text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all">
            {approval.argsPreview}
          </pre>
        </div>
      )}

      {approval.plan && approval.plan !== "(no plan)" && approval.approvalType !== "gateway" && (
        <PlanPreview plan={approval.plan} />
      )}

      <div className="flex flex-wrap gap-2 ml-6">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => handleSelect(option)}
            disabled={!!loading}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              option.variant === "approve" &&
                "border border-success/40 text-success hover:bg-success/10",
              option.variant === "reject" &&
                "border border-destructive/40 text-destructive hover:bg-destructive/10",
              (!option.variant || option.variant === "neutral") &&
                "border border-border hover:border-primary hover:bg-primary/10",
            )}
          >
            {loading === option.value ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              option.label
            )}
          </button>
        ))}
      </div>
    </div>
  );
});

function PlanPreview({ plan }: { plan: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = plan.length > 300;
  const displayText = isLong && !expanded ? plan.slice(0, 300) + "..." : plan;

  return (
    <div className="ml-6">
      <pre className="rounded-md bg-muted/50 border border-border/50 px-3 py-2 text-xs text-foreground/80 whitespace-pre-wrap">
        {displayText}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-[10px] text-primary hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
