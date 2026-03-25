"use client";

import { useMemo } from "react";
import {
  Bot, Clock, Sparkles, Wrench, Zap,
  ArrowRight,
} from "lucide-react";
import { Badge } from "../badge";
import { Separator } from "../separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../dialog";
import type { ExecutionActivity } from "../../types/chat";
import type { EngineAgent } from "@modularmind/api-client";
import { formatModelName } from "../../lib/utils";
import { DurationBadge, formatK } from "./shared";

export interface AgentDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: EngineAgent | null;
  activity: ExecutionActivity;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function ContentBlock({ children, maxH = "max-h-48" }: {
  children: React.ReactNode;
  maxH?: string;
}) {
  return (
    <div className={`rounded-md border border-border/40 bg-muted/5 px-2.5 py-2 ${maxH} overflow-y-auto`}>
      <p className="text-[11px] text-muted-foreground/70 whitespace-pre-wrap break-words leading-relaxed">
        {children}
      </p>
    </div>
  );
}

export function AgentDetailModal({
  open,
  onOpenChange,
  agent,
  activity,
}: AgentDetailModalProps) {
  const name = agent?.name || activity.agentName || "Agent";
  const modelId = activity.model || agent?.model_id;

  const children = activity.children || [];
  const toolChildren = children.filter((c) => c.type === "tool");
  const llmChildren = children.filter((c) => c.type === "llm");
  const llmMessages = llmChildren[0]?.llmData?.messages || [];

  // Classify LLM messages:
  // - First system message (without history prefix) = system prompt
  // - System messages with "### Recent Conversation History" = history
  // - Remaining = context (user prompts, etc.)
  const systemPromptFromLlm = llmMessages.find(
    (m) => m.role === "system" && !m.content.startsWith("### Recent Conversation History"),
  )?.content;
  const historyMessages = llmMessages.filter(
    (m) => m.role === "system" && m.content.startsWith("### Recent Conversation History"),
  );
  const userMessages = llmMessages.filter((m) => m.role === "human" || m.role === "user");

  // Use agent config system prompt, fallback to LLM message
  const effectiveSystemPrompt = agent?.system_prompt || systemPromptFromLlm;
  // Input: from activity or from last user message in LLM context
  const effectiveInput = activity.inputPrompt || userMessages[userMessages.length - 1]?.content;

  /* eslint-disable */
  const aggregatedTokens = useMemo(() => {
    let prompt = 0;
    let completion = 0;
    let total = 0;
    for (const llm of llmChildren) {
      if (llm.llmData?.tokens) {
        prompt += llm.llmData.tokens.prompt || 0;
        completion += llm.llmData.tokens.completion || 0;
        total += llm.llmData.tokens.total || 0;
      }
    }
    return total > 0 ? { prompt, completion, total } : null;
  }, [llmChildren]);
  /* eslint-enable */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <span className="truncate flex-1 min-w-0">{name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-1 min-w-0">
          {/* ── Compact Config ── */}
          <div className="flex flex-wrap items-center gap-1.5">
            {modelId && (
              <Badge variant="secondary" className="text-[10px] font-mono">
                {formatModelName(modelId)}
              </Badge>
            )}
            {agent?.version != null && (
              <Badge variant="outline" className="text-[10px]">
                v{agent.version}
              </Badge>
            )}
            {agent?.timeout_seconds != null && (
              <Badge variant="outline" className="text-[10px]">
                {agent.timeout_seconds}s timeout
              </Badge>
            )}
            {agent?.memory_enabled && (
              <Badge variant="outline" className="text-[10px] text-success border-success/30">
                Memory
              </Badge>
            )}
            {agent?.rag_enabled && (
              <Badge variant="outline" className="text-[10px] text-info border-info/30">
                RAG
              </Badge>
            )}
          </div>

          {/* ── Description ── */}
          {agent?.description && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <SectionLabel>Description</SectionLabel>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {agent.description}
                </p>
              </div>
            </>
          )}

          {/* ── System Prompt ── */}
          {effectiveSystemPrompt && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <SectionLabel>System Prompt</SectionLabel>
                <ContentBlock maxH="max-h-40">{effectiveSystemPrompt}</ContentBlock>
              </div>
            </>
          )}

          {/* ── Conversation History ── */}
          <Separator />
          <div className="space-y-2">
            <SectionLabel>History</SectionLabel>
            {historyMessages.length > 0 ? (
              <ContentBlock maxH="max-h-40">
                {historyMessages.map((m) => m.content).join("\n\n")}
              </ContentBlock>
            ) : (
              <p className="text-[11px] text-muted-foreground/50 italic">No conversation history</p>
            )}
          </div>

          {/* ── Execution ── */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel>Execution</SectionLabel>
              <div className="flex items-center gap-2">
                {activity.durationMs != null && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <DurationBadge durationMs={activity.durationMs} />
                  </div>
                )}
                {activity.isEphemeral && (
                  <Badge variant="outline" className="text-[10px]">
                    <Sparkles className="h-3 w-3 mr-1" />
                    ephemeral
                  </Badge>
                )}
                {aggregatedTokens && (
                  <div className="flex items-center gap-1 text-[11px]">
                    <Zap className="h-3 w-3 text-warning" />
                    <span className="font-mono">{formatK(aggregatedTokens.total)}</span>
                    <span className="text-[10px] text-muted-foreground">tok</span>
                  </div>
                )}
              </div>
            </div>

            {/* Input */}
            {effectiveInput && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <ArrowRight className="h-3 w-3 text-info shrink-0" />
                  <span className="text-[10px] font-medium text-muted-foreground">Input</span>
                </div>
                <ContentBlock maxH="max-h-36">{effectiveInput}</ContentBlock>
              </div>
            )}

            {/* Output */}
            {activity.agentResponse && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <ArrowRight className="h-3 w-3 text-success shrink-0 rotate-180" />
                  <span className="text-[10px] font-medium text-muted-foreground">Output</span>
                </div>
                <ContentBlock maxH="max-h-48">{activity.agentResponse}</ContentBlock>
              </div>
            )}

            {/* Token breakdown */}
            {aggregatedTokens && (
              <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                <span>{formatK(aggregatedTokens.prompt)} in</span>
                <span>{"\u2192"}</span>
                <span>{formatK(aggregatedTokens.completion)} out</span>
                <span>=</span>
                <span className="font-medium text-foreground">{formatK(aggregatedTokens.total)}</span>
                <span className="text-[10px]">tokens</span>
              </div>
            )}

            {/* Tools used */}
            {toolChildren.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">
                  Tools ({toolChildren.length})
                </span>
                <div className="flex flex-wrap gap-1">
                  {toolChildren.map((tool) => (
                    <Badge key={tool.id} variant="outline" className="text-[10px] font-mono">
                      <Wrench className="h-2.5 w-2.5 mr-1" />
                      {tool.toolData?.toolName || tool.label}
                      {tool.toolData?.serverName && (
                        <span className="text-muted-foreground ml-1">({tool.toolData.serverName})</span>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Legacy fallbacks */}
            {!activity.inputPrompt && !activity.agentResponse && activity.preview && (
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">Output</span>
                <ContentBlock>{activity.preview}</ContentBlock>
              </div>
            )}
            {activity.tools && activity.tools.length > 0 && toolChildren.length === 0 && (
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">Tools available</span>
                <div className="flex flex-wrap gap-1">
                  {activity.tools.map((tool) => (
                    <Badge key={tool} variant="outline" className="text-[10px] font-mono">
                      {tool}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
