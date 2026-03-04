"use client";

import { useEffect, useRef } from "react";
import { Bot, Loader2, User } from "lucide-react";
import { cn } from "@modularmind/ui";
import type { Message } from "@/hooks/useChat";
import type { ExecutionActivity } from "@/hooks/useExecutionActivities";
import { ExecutionActivityList } from "./ExecutionActivity";

interface ChatMessagesProps {
  messages: Message[];
  isStreaming: boolean;
  activities: ExecutionActivity[];
  selectedMessageId: string | null;
  onSelectMessage: (id: string) => void;
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

export function ChatMessages({ messages, isStreaming, activities, selectedMessageId, onSelectMessage }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activities]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p className="text-sm">Send a message to start the conversation</p>
        </div>
      ) : (
      <div className="px-4 py-6 space-y-4">
      {messages.map((msg, i) => {
        const isUser = msg.role === "user";
        const isAssistant = msg.role === "assistant";
        const isLast = i === messages.length - 1;
        const isLastAssistant = isAssistant && isLast;
        const isSelected = isAssistant && msg.id === selectedMessageId;

        // While streaming with no content yet: show activity inline next to avatar
        const showInlineActivity = !isUser && isStreaming && isLastAssistant && !msg.content;
        // While streaming with content building: show activity above the bubble
        const showActivityAbove = isLastAssistant && isStreaming && !!msg.content && activities.length > 0;

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
                    isAssistant && "cursor-pointer hover:ring-2 hover:ring-primary/20",
                    isSelected && "ring-2 ring-primary/50 shadow-sm",
                  )}
                  onClick={isAssistant ? () => onSelectMessage(msg.id) : undefined}
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

                  {/* Timestamp */}
                  {msg.content && (
                    <div className={cn(
                      "mt-1.5 text-[10px]",
                      isUser ? "text-primary-foreground/60 text-right" : "text-muted-foreground",
                    )}>
                      {formatTime(msg.created_at)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
      </div>
      )}
    </div>
  );
}
