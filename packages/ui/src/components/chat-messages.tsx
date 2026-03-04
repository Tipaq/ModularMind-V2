"use client";

import { memo, useEffect, useRef } from "react";
import { ArrowRight, Bot, Loader2, User } from "lucide-react";
import { cn } from "../lib/utils";
import type { ExecutionActivity } from "../types/chat";
import { ExecutionActivityList } from "./execution-activity";

const EMPTY_ACTIVITIES: ExecutionActivity[] = [];

/** Minimal message shape — compatible with @modularmind/api-client Message. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

// ─── MessageBubble ──────────────────────────────────────────────────────────

interface MessageBubbleProps {
  msg: ChatMessage;
  isLast: boolean;
  isStreaming: boolean;
  activities: ExecutionActivity[];
  showRoutingMetadata?: boolean;
  selected?: boolean;
  selectable?: boolean;
  onSelect?: () => void;
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

  return (
    <div>
      {/* Activity stream above bubble — only while streaming with content */}
      {showActivityAbove && (
        <div className="mb-3 ml-9">
          <ExecutionActivityList
            activities={activities}
            isStreaming={isStreaming}
            hasContent={true}
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
              hasContent={false}
            />
          </div>
        ) : (
          <div
            className={cn(
              "max-w-[75%] px-4 py-2.5 transition-all",
              isUser
                ? "rounded-2xl rounded-br-md bg-gradient-to-br from-primary to-secondary text-primary-foreground"
                : "rounded-2xl rounded-bl-md bg-muted",
              selectable && "cursor-pointer hover:ring-2 hover:ring-primary/20",
              selected && "ring-2 ring-primary/50 shadow-sm",
            )}
            onClick={selectable ? onSelect : undefined}
          >
            {msg.content ? (
              <div className="text-sm whitespace-pre-wrap break-words">
                {msg.content}
              </div>
            ) : isStreaming && isLastAssistant ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking...
              </div>
            ) : null}

            {/* Routing metadata + timestamp */}
            {msg.content && (
              <div className={cn(
                "flex items-center gap-2 mt-1.5 text-[10px]",
                isUser ? "text-primary-foreground/60 justify-end" : "text-muted-foreground",
              )}>
                {showRoutingMetadata && !isUser && routingStrategy && (
                  <span className="flex items-center gap-1">
                    <ArrowRight className="h-2.5 w-2.5" />
                    {routingStrategy}
                    {delegatedTo && ` \u2192 ${delegatedTo}`}
                  </span>
                )}
                <span>{formatTime(msg.created_at)}</span>
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
}

export const ChatMessages = memo(function ChatMessages({
  messages,
  isStreaming,
  activities,
  showRoutingMetadata,
  selectedMessageId,
  onSelectMessage,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p className="text-sm">Send a message to start the conversation</p>
        </div>
      ) : (
        <div className="px-4 py-6 space-y-4">
          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1;
            const isUser = msg.role === "user";
            const isAssistant = msg.role === "assistant";
            const prevMsg = i > 0 ? messages[i - 1] : null;
            const showDate = !prevMsg || !isSameDay(prevMsg.created_at, msg.created_at);

            return (
              <div key={msg.id}>
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
                  isStreaming={isStreaming}
                  activities={isLast && !isUser ? activities : EMPTY_ACTIVITIES}
                  showRoutingMetadata={showRoutingMetadata}
                  selectable={isAssistant && !!onSelectMessage}
                  selected={isAssistant && msg.id === selectedMessageId}
                  onSelect={isAssistant && onSelectMessage ? () => onSelectMessage(msg.id) : undefined}
                />
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
});
