"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bot, Loader2, Pencil, RefreshCw, User } from "lucide-react";
import { cn } from "../lib/utils";
import type { ExecutionActivity } from "../types/chat";
import type { DetectedArtifact } from "../types/artifact";
import { ExecutionActivityList } from "./execution-activity";
import { AttachmentChip, type AttachmentChipData } from "./attachment-chip";
import { ApprovalCard, type ApprovalRequest } from "./approval-card";
import { PromptCard, type HumanPromptRequest } from "./prompt-card";
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

const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
const SHORT_DATE_FORMAT: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
const LONG_DATE_FORMAT: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" };

function formatShortTime(date: Date): string {
  return date.toLocaleTimeString([], TIME_FORMAT);
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function formatTime(iso: string): string {
  return formatShortTime(new Date(iso));
}

function formatTooltipTime(iso: string): string {
  const d = new Date(iso);
  const time = formatShortTime(d);
  if (isSameDay(iso, new Date().toISOString())) return time;
  const date = d.toLocaleDateString([], SHORT_DATE_FORMAT);
  return `${date}, ${time}`;
}

function formatDateSeparator(iso: string): string {
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(iso, now.toISOString())) return "Today";
  if (isSameDay(iso, yesterday.toISOString())) return "Yesterday";
  return new Date(iso).toLocaleDateString([], LONG_DATE_FORMAT);
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
  onEditMessage?: (messageId: string, newContent: string) => void;
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

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const editRef = useRef<HTMLTextAreaElement>(null);
  const handleEditStart = useCallback(() => {
    setEditContent(msg.content);
    setIsEditing(true);
    setTimeout(() => {
      const ta = editRef.current;
      if (!ta) return;
      ta.style.height = "0";
      ta.style.height = `${ta.scrollHeight}px`;
      ta.focus();
    }, 0);
  }, [msg.content]);

  const handleEditCancel = useCallback(() => {
    setIsEditing(false);
    setEditContent("");
  }, []);

  const handleEditSave = useCallback(() => {
    if (!editContent.trim() || !onEditMessage) return;
    setIsEditing(false);
    onEditMessage(msg.id, editContent.trim());
  }, [editContent, onEditMessage, msg.id]);

  const hasActivities = activities.length > 0;
  const showInlineActivity = !isUser && isLastAssistant && !msg.content && hasActivities;
  const showActivityAbove = isLastAssistant && !!msg.content && hasActivities;
  const timeStr = formatTime(msg.created_at);

  return (
    <div>
      {showTimestamp && (
        <div className="flex items-center justify-center my-3">
          <span className="text-[10px] text-muted-foreground">{timeStr}</span>
        </div>
      )}

      {showActivityAbove && (
        <div className="mb-3 ml-9">
          <ExecutionActivityList activities={activities} isStreaming={isStreaming} />
        </div>
      )}

      <div className={cn("flex items-end gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
        <div
          className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted-foreground/15 text-muted-foreground",
          )}
        >
          {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
        </div>

        {showInlineActivity ? (
          <div className="py-1 min-w-0">
            <ExecutionActivityList activities={activities} isStreaming={isStreaming} />
          </div>
        ) : isUser && isEditing ? (
          <div className="max-w-[75%] w-full flex flex-col items-end">
            <div className="w-full rounded-2xl rounded-br-md border-2 border-primary/50 bg-muted overflow-hidden">
              <textarea
                ref={editRef}
                value={editContent}
                onChange={(e) => {
                  setEditContent(e.target.value);
                  const ta = e.target;
                  ta.style.height = "0";
                  ta.style.height = `${ta.scrollHeight}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditSave(); }
                  if (e.key === "Escape") handleEditCancel();
                }}
                className="w-full px-4 py-2.5 text-sm bg-transparent resize-none outline-none overflow-hidden"
              />
              <div className="flex justify-end gap-2 px-3 py-2 border-t border-border/50">
                <button
                  onClick={handleEditCancel}
                  className="px-3 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSave}
                  disabled={!editContent.trim()}
                  className="px-3 py-1 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
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
                      <div className="text-sm whitespace-pre-wrap break-words">{msg.content}</div>
                    ) : (
                      <div className="chat-markdown text-sm break-words">
                        <MarkdownRenderer content={msg.content} messageId={msg.id} onArtifactDetected={onArtifactDetected} />
                      </div>
                    )
                  ) : isStreaming && isLastAssistantProp ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking...
                    </div>
                  ) : !showInlineActivity ? (
                    <div className="text-sm text-muted-foreground italic">
                      No response generated.
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
              <div className="flex gap-1 mt-1 justify-end opacity-0 group-hover/msg:opacity-100 transition-opacity">
                {isUser && onEditMessage && (
                  <button
                    onClick={handleEditStart}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Edit message"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                {isAssistant && <CopyButton content={msg.content} />}
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
  pendingPrompt?: HumanPromptRequest | null;
  onRespondToPrompt?: (executionId: string, promptId: string, response: string) => Promise<void>;
  /** Decision already made for the current approval. */
  approvalDecision?: "approved" | "rejected" | null;
  /** Callback to approve the execution. */
  onApprove?: (executionId: string, notes?: string) => Promise<void>;
  /** Callback to reject the execution. */
  onReject?: (executionId: string, notes?: string) => Promise<void>;
  onRegenerate?: () => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
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
  pendingPrompt,
  approvalDecision,
  onApprove,
  onReject,
  onRespondToPrompt,
  onRegenerate,
  onEditMessage,
  onArtifactDetected,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMsg = messages[messages.length - 1];

  const lastAssistantIdx = useMemo(() => {
    for (let j = messages.length - 1; j >= 0; j--) {
      if (messages[j].role === "assistant") return j;
    }
    return -1;
  }, [messages]);

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
                  const isLastAssistant = isAssistant && i === lastAssistantIdx;
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
                {pendingPrompt && onRespondToPrompt && (
                  <div className="mt-4 max-w-2xl">
                    <PromptCard
                      prompt={pendingPrompt}
                      onRespond={onRespondToPrompt}
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
