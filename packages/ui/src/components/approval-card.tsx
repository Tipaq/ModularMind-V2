"use client";

import { memo, useState } from "react";
import { CheckCircle2, XCircle, ShieldQuestion, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import Markdown from "react-markdown";

export interface ApprovalRequest {
  executionId: string;
  nodeId: string;
  message: string;
  plan: string;
  timeoutSeconds: number;
}

export interface ApprovalCardProps {
  approval: ApprovalRequest;
  onApprove: (executionId: string) => Promise<void>;
  onReject: (executionId: string) => Promise<void>;
  /** Already decided — show resolved state. */
  decision?: "approved" | "rejected" | null;
}

export const ApprovalCard = memo(function ApprovalCard({
  approval,
  onApprove,
  onReject,
  decision,
}: ApprovalCardProps) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [resolved, setResolved] = useState<"approved" | "rejected" | null>(decision ?? null);

  const handleApprove = async () => {
    setLoading("approve");
    try {
      await onApprove(approval.executionId);
      setResolved("approved");
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async () => {
    setLoading("reject");
    try {
      await onReject(approval.executionId);
      setResolved("rejected");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="my-3 rounded-lg border border-warning/30 bg-warning/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-warning/10 border-b border-warning/20">
        <ShieldQuestion className="h-4 w-4 text-warning" />
        <span className="text-sm font-medium text-warning">Approval Required</span>
      </div>

      {/* Message */}
      <div className="px-4 py-3">
        <p className="text-sm text-foreground">{approval.message}</p>
      </div>

      {/* Plan preview (collapsible) */}
      {approval.plan && approval.plan !== "(no plan)" && (
        <PlanPreview plan={approval.plan} />
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-warning/20">
        {resolved ? (
          <div className={cn(
            "flex items-center gap-2 text-sm font-medium",
            resolved === "approved" ? "text-success" : "text-destructive",
          )}>
            {resolved === "approved" ? (
              <><CheckCircle2 className="h-4 w-4" /> Approved</>
            ) : (
              <><XCircle className="h-4 w-4" /> Rejected</>
            )}
          </div>
        ) : (
          <>
            <button
              onClick={handleApprove}
              disabled={!!loading}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                "bg-success text-success-foreground hover:bg-success/90",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {loading === "approve" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Approve
            </button>
            <button
              onClick={handleReject}
              disabled={!!loading}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {loading === "reject" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              Reject
            </button>
          </>
        )}
      </div>
    </div>
  );
});

/** Collapsible plan preview section. */
function PlanPreview({ plan }: { plan: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = plan.length > 300 && !expanded ? plan.slice(0, 300) + "..." : plan;

  return (
    <div className="px-4 pb-3">
      <div className="rounded-md bg-muted/50 border border-border/50 p-3 text-xs">
        <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
          <Markdown>{preview}</Markdown>
        </div>
        {plan.length > 300 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1 text-xs text-primary hover:underline"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    </div>
  );
}
