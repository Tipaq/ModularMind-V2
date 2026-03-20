"use client";

import { memo, useEffect, useRef } from "react";
import { ArrowRight, Bot, Loader2, Pencil, RefreshCw, User } from "lucide-react";
import { cn } from "../lib/utils";
import type { ExecutionActivity } from "../types/chat";
import type { DetectedArtifact } from "../types/artifact";
import { ExecutionActivityList } from "./execution-activity";
import { AttachmentChip, type AttachmentChipData } from "./attachment-chip";
import { ApprovalCard, type ApprovalRequest } from "./approval-card";
import { ChatEmptyState } from "./chat-empty-state";
import { CopyButton } from "./copy-button";
import { MarkdownRenderer } from "./markdown-renderer";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

const EMPTY_ACTIVITIES: ExecutionActivity[] = [];

/** Minutes threshold — if two consecutive messages are closer than this, hide the timestamp. */
const TIMESTAMP_GAP_MINUTES = 5;

/**
 * Minimal message shape for the ChatMessages UI component.
 *
 * Structurally compatible with `Message` from `@modularmind/api-client` —
 * any api-client Message satisfies this interface.  `attachments` uses
 * `AttachmentChipData` which is structurally identical to `MessageAttachment`.
 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  created_at: string;
  metadata?: Record<string, unknown>;
  attachments?: AttachmentChipData[];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Full date+time for tooltip — just time if today, otherwise date + time. */
function formatTooltipTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isSameDay(iso, new Date().toISOString())) return time;
  const date = d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  return `${date}, ${time}`;
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function formatDateSeparator(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(iso, now.toISOString())) return "Today";
  if (isSameDay(iso, yesterday.toISOString())) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

/** Returns true if the gap between two ISO timestamps is >= TIMESTAMP_GAP_MINUTES. */
function shouldShowTimestamp(prevIso: string | null, currentIso: string): boolean {
  if (!prevIso) return true;
  const diff = Math.abs(new Date(currentIso).getTime() - new Date(prevIso).getTime());
  return diff >= TIMESTAMP_GAP_MINUTES * 60 * 1000;
}

// ─── MessageBubble ──────────────────────────────────────────────────────────

interface MessageBubbleProps {
  msg: ChatMessage;
  isLast: boolean;
  isLastAssistant: boolean;
  isStreaming: boolean;
  activities: ExecutionActivity[];
  showRoutingMetadata?: boolean;
  selected?: boolean;
  selectable?: boolean;
  onSelect?: () => void;
  showTimestamp: boolean;
  attachmentBaseUrl?: string;
  onArtifactDetected?: (artifact: DetectedArtifact) => void;
  onEditMessage?: (content: string, messageId: string) => void;
  onRegenerate?: () => void;
}

const MessageBubble = memo(function MessageBubble({
  msg,
  isLast,
  isStreaming,
  activities,
  showRoutingMetadata,
  selected,
  selectable,
  onSelect,
  showTimestamp,
  attachmentBaseUrl,
  onArtifactDetected,
  onEditMessage,
  onRegenerate,
  isLastAssistant: isLastAssistantProp,
}: MessageBubbleProps) {
  const isUser = msg.role === "user";
  const isAssistant = msg.role === "assistant";
  const isLastAssistant = isAssistant && isLast;
  const metadata = msg.metadata || {};
  const routingStrategy = metadata.routing_strategy as string | undefined;
  const delegatedTo = metadata.delegated_to as string | undefined;

  // While streaming with no content yet: show activity inline next to avatar
  const showInlineActivity = !isUser && isStreaming && isLastAssistant && !msg.content;
  // While streaming with content building: show activity above the bubble
  const showActivityAbove = isLastAssistant && isStreaming && !!msg.content && activities.length > 0;

  const timeStr = formatTime(msg.created_at);

  return (
    <div>
      {/* Messenger-style timestamp centered above the message */}
      {showTimestamp && (
        <div className="flex items-center justify-center my-3">
          <span className="text-[10px] text-muted-foreground">
            {timeStr}
          </span>
        </div>
      )}

      {/* Activity stream above bubble — only while streaming with content */}
      {showActivityAbove && (
        <div className="mb-3 ml-9">
          <ExecutionActivityList
            activities={activities}
            isStreaming={isStreaming}
          />
        </div>
      )}

      <div className={cn("flex items-end gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
        {/* Avatar */}
        <div
          className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted-foreground/15 text-muted-foreground",
          )}
        >
          {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
        </div>

        {/* Inline activity (streaming, no content) OR bubble */}
        {showInlineActivity ? (
          <div className="py-1 min-w-0">
            <ExecutionActivityList
              activities={activities}
              isStreaming={isStreaming}
            />
          </div>
        ) : (
          <div className={cn("max-w-[75%] group/msg", isUser && "flex flex-col items-end")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "px-4 py-2.5 transition-all",
                    isUser
                      ? "rounded-2xl rounded-br-md bg-gradient-to-br from-primary to-secondary text-primary-foreground"
                      : "rounded-2xl rounded-bl-md bg-muted",
                    selectable && "cursor-pointer hover:ring-2 hover:ring-primary/20",
                    selected && "ring-2 ring-primary/50 shadow-sm",
                  )}
                  onClick={selectable ? onSelect : undefined}
                >
                  {msg.content ? (
                    isUser ? (
                      <div className="text-sm whitespace-pre-wrap break-words">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="chat-markdown text-sm break-words">
                        <MarkdownRenderer
                          content={msg.content}
                          messageId={msg.id}
                          onArtifactDetected={onArtifactDetected}
                        />
                      </div>
                    )
                  ) : isStreaming && isLastAssistantProp ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking...
                    </div>
                  ) : null}

                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {msg.attachments.map((att) => (
                        <AttachmentChip key={att.id} attachment={att} downloadBaseUrl={attachmentBaseUrl} />
                      ))}
                    </div>
                  )}

                  {msg.content && showRoutingMetadata && !isUser && routingStrategy && (
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ArrowRight className="h-2.5 w-2.5" />
                        {routingStrategy}
                        {delegatedTo && ` \u2192 ${delegatedTo}`}
                      </span>
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side={isUser ? "left" : "right"} align="center" className="text-[10px]">
                {formatTooltipTime(msg.created_at)}
              </TooltipContent>
            </Tooltip>

            {msg.content && !isStreaming && (
              <div className={cn(
                "flex gap-1 mt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity",
                "justify-end",
              )}>
                {isUser && onEditMessage && (
                  <button
                    onClick={() => onEditMessage(msg.content, msg.id)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Edit message"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                {isAssistant && (
                  <CopyButton content={msg.content} />
                )}
                {isLastAssistantProp && onRegenerate && (
                  <button
                    onClick={onRegenerate}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Regenerate response"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// ─── ChatMessages ───────────────────────────────────────────────────────────

export interface ChatMessagesProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  activities: ExecutionActivity[];
  /** Show routing strategy + delegation info on assistant bubbles. */
  showRoutingMetadata?: boolean;
  /** Currently selected message id (for inspection panels). */
  selectedMessageId?: string | null;
  /** Callback when an assistant message bubble is clicked. */
  onSelectMessage?: (id: string) => void;
  /** Base URL for attachment download links. Default: "/api/v1/conversations". */
  attachmentBaseUrl?: string;
  /** Content rendered sticky at the bottom of the scroll container (e.g. ChatInput). */
  stickyFooter?: React.ReactNode;
  /** Suggested prompts for the empty state. */
  suggestedPrompts?: Array<{ label: string; prompt: string }>;
  /** Callback when a suggestion chip is clicked. */
  onSuggestionClick?: (prompt: string) => void;
  /** Pending approval request from a graph approval gate. */
  pendingApproval?: ApprovalRequest | null;
  /** Decision already made for the current approval. */
  approvalDecision?: "approved" | "rejected" | null;
  /** Callback to approve the execution. */
  onApprove?: (executionId: string) => Promise<void>;
  /** Callback to reject the execution. */
  onReject?: (executionId: string) => Promise<void>;
  onRegenerate?: () => void;
  onEditMessage?: (content: string, messageId: string) => void;
  onArtifactDetected?: (artifact: DetectedArtifact) => void;
}

export const ChatMessages = memo(function ChatMessages({
  messages,
  isStreaming,
  activities,
  showRoutingMetadata,
  selectedMessageId,
  onSelectMessage,
  attachmentBaseUrl,
  stickyFooter,
  suggestedPrompts,
  onSuggestionClick,
  pendingApproval,
  approvalDecision,
  onApprove,
  onReject,
  onRegenerate,
  onEditMessage,
  onArtifactDetected,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMsg = messages[messages.length - 1];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, lastMsg?.content]);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="min-h-full flex flex-col">
          <div className={messages.length === 0 ? "flex-1 flex items-center justify-center" : "flex-1"}>
            {messages.length === 0 ? (
              <ChatEmptyState
                suggestions={suggestedPrompts}
                onSuggestionClick={onSuggestionClick}
              />
            ) : (
              <div className="px-4 py-6 pb-32">
                {messages.map((msg, i) => {
                  const isLast = i === messages.length - 1;
                  const isUser = msg.role === "user";
                  const isAssistant = msg.role === "assistant";
                  const isLastAssistant = isAssistant && !messages.slice(i + 1).some((m) => m.role === "assistant");
                  const prevMsg = i > 0 ? messages[i - 1] : null;
                  const showDate = !prevMsg || !isSameDay(prevMsg.created_at, msg.created_at);
                  const showTimestamp = shouldShowTimestamp(
                    prevMsg?.created_at ?? null,
                    msg.created_at,
                  );
                  const sameSender = prevMsg && prevMsg.role === msg.role;
                  const gap = i === 0 ? "" : sameSender ? "mt-1" : "mt-4";

                  return (
                    <div key={msg.id} className={gap}>
                      {showDate && (
                        <div className="flex items-center justify-center my-4">
                          <span className="text-[11px] text-muted-foreground bg-muted px-3 py-1 rounded-full">
                            {formatDateSeparator(msg.created_at)}
                          </span>
                        </div>
                      )}
                      <MessageBubble
                        msg={msg}
                        isLast={isLast}
                        isLastAssistant={isLastAssistant}
                        isStreaming={isStreaming}
                        activities={isLast && !isUser ? activities : EMPTY_ACTIVITIES}
                        showRoutingMetadata={showRoutingMetadata}
                        selectable={isAssistant && !!onSelectMessage}
                        selected={isAssistant && msg.id === selectedMessageId}
                        onSelect={isAssistant && onSelectMessage ? () => onSelectMessage(msg.id) : undefined}
                        showTimestamp={showTimestamp}
                        attachmentBaseUrl={attachmentBaseUrl}
                        onArtifactDetected={onArtifactDetected}
                        onEditMessage={onEditMessage}
                        onRegenerate={onRegenerate}
                      />
                    </div>
                  );
                })}
                {pendingApproval && onApprove && onReject && (
                  <div className="mt-4 max-w-2xl">
                    <ApprovalCard
                      approval={pendingApproval}
                      onApprove={onApprove}
                      onReject={onReject}
                      decision={approvalDecision}
                    />
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
          {stickyFooter && (
            <div className="sticky bottom-0 z-10 bg-gradient-to-t from-background from-80% to-transparent">
              {stickyFooter}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
});
