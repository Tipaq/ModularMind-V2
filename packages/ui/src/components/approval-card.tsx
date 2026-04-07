"use client";

import { memo, useState } from "react";
import { ShieldCheck, CheckCircle2, XCircle, Loader2 } from "lucide-react";
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
  approvalType?: "graph" | "gateway" | "prompt";
  approvalId?: string;
  toolName?: string;
  argsPreview?: string;
  options?: ApprovalOption[];
  promptId?: string;
}

export interface ApprovalCardProps {
  approval: ApprovalRequest;
  onApprove: (executionId: string, notes?: string) => Promise<void>;
  onReject: (executionId: string, notes?: string) => Promise<void>;
  onRespond?: (executionId: string, promptId: string, response: string) => Promise<void>;
  decision?: "approved" | "rejected" | null;
}

export const ApprovalCard = memo(function ApprovalCard({
  approval,
  onApprove,
  onReject,
  onRespond,
  decision,
}: ApprovalCardProps) {
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<{ index: number; notes?: string } | null>(
    decision ? { index: decision === "rejected" ? -1 : 0 } : null,
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [customInput, setCustomInput] = useState("");

  const options = approval.options ?? DEFAULT_OPTIONS;
  const isPrompt = !!approval.promptId;
  const isBinary = !isPrompt && options.length === 2
    && options.some((o) => o.variant === "approve")
    && options.some((o) => o.variant === "reject");
  const isCustomSelected = selectedIndex === options.length;

  const handleConfirm = async (option: ApprovalOption) => {
    setLoading(true);
    try {
      if (isPrompt && onRespond && approval.promptId) {
        await onRespond(approval.executionId, approval.promptId, option.value);
      } else if (option.variant === "reject" || option.value === "rejected") {
        await onReject(approval.executionId);
      } else {
        await onApprove(approval.executionId);
      }
      setResolved({ index: options.indexOf(option) });
    } finally {
      setLoading(false);
    }
  };

  const handleCustomSubmit = async () => {
    const text = customInput.trim();
    if (!text) return;
    setLoading(true);
    try {
      if (isPrompt && onRespond && approval.promptId) {
        await onRespond(approval.executionId, approval.promptId, text);
      } else {
        await onApprove(approval.executionId, text);
      }
      setResolved({ index: options.length, notes: text });
    } finally {
      setLoading(false);
    }
  };

  if (resolved) {
    const resolvedOption = resolved.index >= 0 && resolved.index < options.length
      ? options[resolved.index]
      : null;
    const isRejected = resolvedOption?.variant === "reject" || resolvedOption?.value === "rejected";
    const isCustom = resolved.index === options.length;
    return (
      <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1">
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
            {isCustom ? "Custom response" : (resolvedOption?.label ?? "Done")}
          </span>
        </div>
        {isCustom && resolved.notes && (
          <p className="text-xs text-muted-foreground ml-5 italic">{resolved.notes}</p>
        )}
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

      {/* Plan / args context — always visible */}
      {approval.approvalType === "gateway" && approval.argsPreview && (
        <div className="px-4 pb-2 pl-10">
          <pre className="rounded-md bg-muted/60 border border-border/50 px-3 py-2 text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all">
            {approval.argsPreview}
          </pre>
        </div>
      )}

      {approval.plan && approval.plan !== "(no plan)" && approval.approvalType !== "gateway" && (
        <div className="px-4 pb-2 pl-10">
          <div className="rounded-md bg-muted/50 border border-border/50 px-3 py-2 text-xs prose prose-sm dark:prose-invert max-w-none [&>*]:m-0 [&>*+*]:mt-2">
            <Markdown>{approval.plan}</Markdown>
          </div>
        </div>
      )}

      {/* Options */}
      <div className="px-4 pb-4 pt-1">
        {isBinary ? (
          <BinaryActions options={options} loading={loading} onSelect={handleConfirm} />
        ) : (
          <div className="space-y-2 ml-6">
            <div className="rounded-md border border-border/60 overflow-hidden divide-y divide-border/40">
              {options.map((option, index) => (
                <RadioRow
                  key={index}
                  label={option.label}
                  isSelected={selectedIndex === index}
                  isReject={option.variant === "reject"}
                  disabled={loading}
                  onSelect={() => setSelectedIndex(index)}
                />
              ))}
              {/* Custom response as last option */}
              <RadioRow
                label="Suggest something else"
                isSelected={isCustomSelected}
                disabled={loading}
                onSelect={() => setSelectedIndex(options.length)}
              />
            </div>

            {/* Custom input field */}
            {isCustomSelected && (
              <textarea
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Describe what you'd like instead..."
                disabled={loading}
                rows={2}
                className={cn(
                  "w-full rounded-md border border-border/60 bg-background px-3 py-2",
                  "text-sm resize-none placeholder:text-muted-foreground/60",
                  "focus:outline-none focus:ring-1 focus:ring-primary/50",
                  "disabled:opacity-50",
                )}
              />
            )}

            {/* Confirm button */}
            {isCustomSelected ? (
              <button
                onClick={handleCustomSubmit}
                disabled={!customInput.trim() || loading}
                className={cn(
                  "w-full px-3 py-2 rounded-md text-xs font-medium transition-colors",
                  "bg-primary text-primary-foreground hover:bg-primary/90",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" />
                ) : (
                  "Send response"
                )}
              </button>
            ) : (
              <ConfirmButton
                option={selectedIndex !== null ? options[selectedIndex] : null}
                loading={loading}
                onConfirm={handleConfirm}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
});

function RadioRow({
  label,
  isSelected,
  isReject,
  disabled,
  onSelect,
}: {
  label: string;
  isSelected: boolean;
  isReject?: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
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
        isSelected ? "text-foreground" : "text-muted-foreground",
      )}>
        {label}
      </span>
      {isReject && (
        <XCircle className="h-3.5 w-3.5 text-destructive/50 ml-auto shrink-0" />
      )}
    </button>
  );
}

function ConfirmButton({
  option,
  loading,
  onConfirm,
}: {
  option: ApprovalOption | null;
  loading: boolean;
  onConfirm: (option: ApprovalOption) => void;
}) {
  return (
    <button
      onClick={() => option && onConfirm(option)}
      disabled={!option || loading}
      className={cn(
        "w-full px-3 py-2 rounded-md text-xs font-medium transition-colors",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        option?.variant === "reject"
          ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
      )}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" />
      ) : (
        option ? `Confirm: ${option.label}` : "Select an option"
      )}
    </button>
  );
}

function BinaryActions({
  options,
  loading,
  onSelect,
}: {
  options: ApprovalOption[];
  loading: boolean;
  onSelect: (option: ApprovalOption) => void;
}) {
  return (
    <div className="flex gap-2 ml-6">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option)}
          disabled={loading}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            option.variant === "approve" &&
              "border border-success/40 text-success hover:bg-success/10",
            option.variant === "reject" &&
              "border border-destructive/40 text-destructive hover:bg-destructive/10",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
