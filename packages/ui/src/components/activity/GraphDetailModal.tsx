"use client";

import { useMemo } from "react";
import {
  Workflow, Clock, GitBranch, Bot, Zap,
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
import type { EngineGraph } from "../../types/engine";
import { DurationBadge, formatK } from "./shared";

export interface GraphDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  graph: EngineGraph | null;
  activity: ExecutionActivity;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function ContentBlock({ children, maxH = "max-h-40" }: {
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

export function GraphDetailModal({
  open,
  onOpenChange,
  graph,
  activity,
}: GraphDetailModalProps) {
  const name = graph?.name || activity.graphName || "Graph";
  const children = useMemo(() => activity.children || [], [activity.children]);
  const agentChildren = children.filter((c) => c.type === "agent_execution");

  const aggregatedTokens = useMemo(() => {
    let prompt = 0;
    let completion = 0;
    let total = 0;
    const collectTokens = (acts: ExecutionActivity[]) => {
      for (const a of acts) {
        if (a.type === "llm" && a.llmData?.tokens) {
          prompt += a.llmData.tokens.prompt || 0;
          completion += a.llmData.tokens.completion || 0;
          total += a.llmData.tokens.total || 0;
        }
        if (a.children?.length) collectTokens(a.children);
      }
    };
    collectTokens(children);
    return total > 0 ? { prompt, completion, total } : null;
  }, [children]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[80vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
              <Workflow className="h-4 w-4 text-success" />
            </div>
            <span className="truncate flex-1 min-w-0">{name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-1 min-w-0">
          {/* ── Config badges ── */}
          <div className="flex flex-wrap items-center gap-1.5">
            {activity.nodeCount != null && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <GitBranch className="h-2.5 w-2.5" />
                {activity.nodeCount} nodes
              </Badge>
            )}
            {graph?.version != null && (
              <Badge variant="outline" className="text-[10px]">
                v{graph.version}
              </Badge>
            )}
            {agentChildren.length > 0 && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Bot className="h-2.5 w-2.5" />
                {agentChildren.length} agent{agentChildren.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          {/* ── Description ── */}
          {graph?.description && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <SectionLabel>Description</SectionLabel>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {graph.description}
                </p>
              </div>
            </>
          )}

          {/* ── Execution Pipeline ── */}
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
                {aggregatedTokens && (
                  <div className="flex items-center gap-1 text-[11px]">
                    <Zap className="h-3 w-3 text-warning" />
                    <span className="font-mono">{formatK(aggregatedTokens.total)}</span>
                    <span className="text-[10px] text-muted-foreground">tok</span>
                  </div>
                )}
              </div>
            </div>

            {/* Agent pipeline */}
            {agentChildren.length > 0 && (
              <div className="space-y-1.5">
                {agentChildren.map((agent, i) => {
                  const agentLlm = (agent.children || []).filter((c) => c.type === "llm");
                  const agentTokens = agentLlm.reduce((sum, l) => sum + (l.llmData?.tokens?.total || 0), 0);
                  return (
                    <div
                      key={agent.id}
                      className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/5 px-2.5 py-2"
                    >
                      <span className="text-[10px] font-mono text-muted-foreground/50 w-4 shrink-0">
                        {i + 1}.
                      </span>
                      <Bot className="h-3 w-3 text-info shrink-0" />
                      <span className="text-[11px] font-medium truncate flex-1 min-w-0">
                        {agent.agentName || agent.label}
                      </span>
                      {agentTokens > 0 && (
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {formatK(agentTokens)} tok
                        </span>
                      )}
                      <DurationBadge durationMs={agent.durationMs} />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Agent outputs */}
            {agentChildren.some((a) => a.agentResponse) && (
              <>
                <SectionLabel>Agent Outputs</SectionLabel>
                {agentChildren
                  .filter((a) => a.agentResponse)
                  .map((agent) => (
                    <div key={agent.id} className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">
                        {agent.agentName || agent.label}
                      </span>
                      <ContentBlock maxH="max-h-24">{agent.agentResponse}</ContentBlock>
                    </div>
                  ))}
              </>
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
