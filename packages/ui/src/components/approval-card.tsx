"use client";

import { memo, useState } from "react";
import { ShieldCheck, CheckCircle2, XCircle, Loader2, ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";
import Markdown from "react-markdown";

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
  const [selected, setSelected] = useState<string | null>(null);

  const options = approval.options ?? DEFAULT_OPTIONS;
  const isBinary = options.length === 2
    && options.some((o) => o.variant === "approve")
    && options.some((o) => o.variant === "reject");

  const handleConfirm = async (option: ApprovalOption) => {
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
    const resolvedOption = options.find((o) => o.value === resolved);
    const isRejected = resolved === "rejected" || resolvedOption?.variant === "reject";
    return (
      <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isRejected ? (
            <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
          )}
          <span className="line-clamp-1">{approval.message}</span>
          <span className={cn(
            "ml-auto text-[10px] font-medium whitespace-nowrap",
            isRejected ? "text-destructive" : "text-success",
          )}>
            {resolvedOption?.label ?? resolved}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-2 px-4 pt-4 pb-2">
        <ShieldCheck className="h-4 w-4 text-warning mt-0.5 shrink-0" />
        <div className="text-sm font-medium prose prose-sm dark:prose-invert max-w-none [&>p]:m-0">
          <Markdown>{approval.message}</Markdown>
        </div>
      </div>

      {/* Plan / args context */}
      {approval.approvalType === "gateway" && approval.argsPreview && (
        <div className="px-4 pb-2 pl-10">
          <pre className="rounded-md bg-muted/60 border border-border/50 px-3 py-2 text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all">
            {approval.argsPreview}
          </pre>
        </div>
      )}

      {approval.plan && approval.plan !== "(no plan)" && approval.approvalType !== "gateway" && (
        <PlanPreview plan={approval.plan} />
      )}

      {/* Options */}
      <div className="px-4 pb-4 pt-1">
        {isBinary ? (
          <BinaryActions
            options={options}
            loading={loading}
            onSelect={handleConfirm}
          />
        ) : (
          <ListActions
            options={options}
            selected={selected}
            loading={loading}
            onSelect={setSelected}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </div>
  );
});

function BinaryActions({
  options,
  loading,
  onSelect,
}: {
  options: ApprovalOption[];
  loading: string | null;
  onSelect: (option: ApprovalOption) => void;
}) {
  return (
    <div className="flex gap-2 ml-6">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option)}
          disabled={!!loading}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            option.variant === "approve" &&
              "border border-success/40 text-success hover:bg-success/10",
            option.variant === "reject" &&
              "border border-destructive/40 text-destructive hover:bg-destructive/10",
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
  );
}

function ListActions({
  options,
  selected,
  loading,
  onSelect,
  onConfirm,
}: {
  options: ApprovalOption[];
  selected: string | null;
  loading: string | null;
  onSelect: (value: string) => void;
  onConfirm: (option: ApprovalOption) => void;
}) {
  const selectedOption = options.find((o) => o.value === selected);

  return (
    <div className="space-y-2 ml-6">
      <div className="rounded-md border border-border/60 overflow-hidden divide-y divide-border/40">
        {options.map((option) => {
          const isSelected = selected === option.value;
          return (
            <button
              key={option.value}
              onClick={() => onSelect(option.value)}
              disabled={!!loading}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                "hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed",
                isSelected && "bg-primary/5",
              )}
            >
              <span className={cn(
                "h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
                isSelected ? "border-primary" : "border-muted-foreground/30",
              )}>
                {isSelected && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <span className={cn(
                "font-medium",
                isSelected && "text-foreground",
                !isSelected && "text-muted-foreground",
              )}>
                {option.label}
              </span>
              {option.variant === "reject" && (
                <XCircle className="h-3.5 w-3.5 text-destructive/50 ml-auto shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => selectedOption && onConfirm(selectedOption)}
        disabled={!selectedOption || !!loading}
        className={cn(
          "w-full px-3 py-2 rounded-md text-xs font-medium transition-colors",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          selectedOption?.variant === "reject"
            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" />
        ) : (
          selectedOption ? `Confirm: ${selectedOption.label}` : "Select an option"
        )}
      </button>
    </div>
  );
}

function PlanPreview({ plan }: { plan: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = plan.length > 400;

  return (
    <div className="px-4 pb-2 pl-10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mb-1 transition-colors"
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
        {expanded ? "Hide plan" : "Show plan"}
      </button>
      {expanded && (
        <div className="rounded-md bg-muted/50 border border-border/50 px-3 py-2 text-xs prose prose-sm dark:prose-invert max-w-none [&>*]:m-0 [&>*+*]:mt-2">
          <Markdown>{plan}</Markdown>
        </div>
      )}
    </div>
  );
}
