"use client";

import { useEffect, useRef } from "react";
import { Bot, Clock, Loader2, User } from "lucide-react";
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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
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
        const metadata = msg.metadata || {};
        const durationMs = typeof metadata.duration_ms === "number" ? metadata.duration_ms : null;

        // While streaming with no content yet: show activity inline next to avatar
        const showInlineActivity = !isUser && isStreaming && isLastAssistant && !msg.content;
        // While streaming with content building: show activity above the bubble
        const showActivityAbove = isLastAssistant && isStreaming && !!msg.content && activities.length > 0;

        return (
          <div key={msg.id}>
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
                    "max-w-[75%] rounded-2xl px-4 py-2.5 transition-all",
                    isUser
                      ? "bg-gradient-to-br from-primary to-secondary text-primary-foreground"
                      : "bg-muted",
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

                  {/* Duration inside message bubble */}
                  {!isUser && msg.content && durationMs != null && durationMs > 0 && (
                    <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" />
                      {formatDuration(durationMs)}
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
