"use client";

import { useState, useMemo } from "react";
import { Bot, Cpu, FileText, Clock, Sparkles, Wrench, Brain, Zap } from "lucide-react";
import { Badge } from "../badge";
import { Separator } from "../separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../dialog";
import type { ExecutionActivity } from "../../types/chat";
import type { EngineAgent } from "../../types/engine";
import { DurationBadge, formatK } from "./shared";

export interface AgentDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: EngineAgent | null;
  activity: ExecutionActivity;
}

export function AgentDetailModal({
  open,
  onOpenChange,
  agent,
  activity,
}: AgentDetailModalProps) {
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [inputExpanded, setInputExpanded] = useState(false);
  const [responseExpanded, setResponseExpanded] = useState(false);
  const name = agent?.name || activity.agentName || "Agent";

  const children = activity.children || [];
  const toolChildren = children.filter((c) => c.type === "tool");
  const llmChildren = children.filter((c) => c.type === "llm");

  // Aggregate token usage from LLM children
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="truncate block">{name}</span>
            </div>
            <Badge
              variant={
                activity.status === "running"
                  ? "default"
                  : activity.status === "failed"
                    ? "destructive"
                    : "secondary"
              }
              className="text-[10px] shrink-0"
            >
              {activity.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Execution stats */}
          <div className="flex items-center gap-3 flex-wrap">
            {activity.durationMs != null && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <DurationBadge durationMs={activity.durationMs} />
              </div>
            )}
            {activity.isEphemeral && (
              <Badge variant="outline" className="text-[10px]">
                <Sparkles className="h-3 w-3 mr-1" />
                ephemeral
              </Badge>
            )}
            {activity.model && (
              <Badge variant="secondary" className="text-[10px]">
                <Cpu className="h-3 w-3 mr-1" />
                {activity.model}
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

          {/* Agent description */}
          {agent?.description && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Description
              </p>
              <p className="text-sm text-muted-foreground">
                {agent.description}
              </p>
            </div>
          )}

          {/* Model */}
          {agent?.model_id && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Model
              </p>
              <div className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-mono">{agent.model_id}</span>
              </div>
            </div>
          )}

          {/* System prompt */}
          {agent?.system_prompt && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  System Prompt
                </p>
                <button
                  onClick={() => setPromptExpanded(!promptExpanded)}
                  className="text-[10px] text-primary hover:underline"
                >
                  {promptExpanded ? "Collapse" : "Expand"}
                </button>
              </div>
              <pre
                className={`text-[11px] bg-muted/50 rounded-md p-2.5 whitespace-pre-wrap break-words text-muted-foreground overflow-hidden ${
                  promptExpanded ? "" : "line-clamp-4"
                }`}
              >
                {agent.system_prompt}
              </pre>
            </div>
          )}

          {/* Version */}
          {agent?.version != null && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              <span>Version {agent.version}</span>
            </div>
          )}

          <Separator />

          {/* Execution I/O */}
          <div className="space-y-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Execution
            </p>

            {/* Input prompt */}
            {activity.inputPrompt && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">Input</p>
                  {activity.inputPrompt.length > 200 && (
                    <button
                      onClick={() => setInputExpanded(!inputExpanded)}
                      className="text-[10px] text-primary hover:underline"
                    >
                      {inputExpanded ? "Collapse" : "Expand"}
                    </button>
                  )}
                </div>
                <pre
                  className={`text-[11px] bg-muted/50 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap break-words text-muted-foreground ${
                    inputExpanded ? "" : "max-h-24 overflow-hidden"
                  }`}
                >
                  {activity.inputPrompt}
                </pre>
              </div>
            )}

            {/* Response */}
            {activity.agentResponse && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">Response</p>
                  {activity.agentResponse.length > 200 && (
                    <button
                      onClick={() => setResponseExpanded(!responseExpanded)}
                      className="text-[10px] text-primary hover:underline"
                    >
                      {responseExpanded ? "Collapse" : "Expand"}
                    </button>
                  )}
                </div>
                <pre
                  className={`text-[11px] bg-muted/50 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap break-words text-muted-foreground ${
                    responseExpanded ? "" : "max-h-40 overflow-hidden"
                  }`}
                >
                  {activity.agentResponse}
                </pre>
              </div>
            )}

            {/* Token breakdown */}
            {aggregatedTokens && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Token Usage</p>
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span>{formatK(aggregatedTokens.prompt)}</span>
                  <span className="text-muted-foreground">\u2192</span>
                  <span>{formatK(aggregatedTokens.completion)}</span>
                  <span className="text-muted-foreground">=</span>
                  <span className="font-medium">{formatK(aggregatedTokens.total)}</span>
                  <span className="text-[10px] text-muted-foreground">tokens</span>
                </div>
              </div>
            )}

            {/* Tools used */}
            {toolChildren.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">
                  Tools Used ({toolChildren.length})
                </p>
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

            {/* LLM calls */}
            {llmChildren.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">
                  LLM Calls ({llmChildren.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {llmChildren.map((llm) => (
                    <Badge key={llm.id} variant="outline" className="text-[10px] font-mono">
                      <Brain className="h-2.5 w-2.5 mr-1" />
                      {llm.model || llm.llmData?.model || "LLM"}
                      {llm.llmData?.tokens && (
                        <span className="text-muted-foreground ml-1">
                          {formatK(llm.llmData.tokens.total)} tok
                        </span>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Legacy: Output preview (for non-agent_execution types) */}
            {!activity.inputPrompt && !activity.agentResponse && activity.preview && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Output</p>
                <pre className="text-[11px] bg-muted/50 rounded-md p-2.5 overflow-x-auto max-h-40 whitespace-pre-wrap break-words text-muted-foreground">
                  {activity.preview}
                </pre>
              </div>
            )}

            {/* Legacy: Tools available (for non-agent_execution types) */}
            {activity.tools && activity.tools.length > 0 && toolChildren.length === 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Tools available</p>
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
