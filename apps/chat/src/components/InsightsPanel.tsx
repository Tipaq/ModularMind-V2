import { useState, memo } from "react";
import {
  Badge,
  TabsContent,
  cn,
  ChatPanel,
  formatTokens,
} from "@modularmind/ui";
import type { ChatPanelTab, TokenUsage } from "@modularmind/ui";
import type { EngineAgent, EngineGraph, EngineModel } from "@modularmind/api-client";
import {
  Route,
  BookOpen,
  Brain,
  FileText,
  ChevronDown,
  ChevronRight,
  Loader2,
  Database,
  Star,
  Sparkles,
  Settings2,
  Cpu,
  Activity,
  Bot,
  Workflow,
} from "lucide-react";
import type {
  SupervisorData,
  KnowledgeData,
  KnowledgeChunk,
} from "../hooks/useInsightsPanel";
import type { InsightsMemoryEntry } from "@modularmind/ui";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function contextColor(pct: number) {
  if (pct >= 90) return { text: "text-destructive", bg: "bg-destructive" };
  if (pct >= 70) return { text: "text-warning", bg: "bg-warning" };
  return { text: "text-primary", bg: "bg-primary" };
}

// ─── Config Tab ──────────────────────────────────────────────────────────────

interface ConfigTabProps {
  selectedModel: EngineModel | null;
  supervisorMode: boolean;
  enabledAgents: EngineAgent[];
  enabledGraphs: EngineGraph[];
  tokenUsage: TokenUsage | null;
}

function ConfigTab({
  selectedModel,
  supervisorMode,
  enabledAgents,
  enabledGraphs,
  tokenUsage,
}: ConfigTabProps) {
  const contextWindow = selectedModel?.context_window;
  const promptTokens = tokenUsage?.prompt ?? 0;
  const contextPercent =
    contextWindow && promptTokens > 0
      ? Math.min(Math.round((promptTokens / contextWindow) * 100), 100)
      : null;

  return (
    <div className="space-y-4">
      {/* ── Model ──────────────────────────────────────────────────────────── */}
      <section className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <Cpu className="h-3 w-3" />
          Model
        </p>
        {selectedModel ? (
          <div className="rounded-md border border-border/50 bg-muted/20 p-2.5 space-y-1.5">
            <p className="text-sm font-medium">
              {selectedModel.display_name || selectedModel.name}
            </p>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {selectedModel.provider}
              </Badge>
              {contextWindow && (
                <span className="text-[10px] text-muted-foreground">
                  {formatTokens(contextWindow)} context
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No model selected</p>
        )}
      </section>

      {/* ── Context Usage ──────────────────────────────────────────────────── */}
      {contextPercent !== null && contextWindow && (
        <section className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <Activity className="h-3 w-3" />
            Context Window
          </p>
          <div className="rounded-md border border-border/50 bg-muted/20 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {formatTokens(promptTokens)} / {formatTokens(contextWindow)}
              </span>
              <span
                className={cn(
                  "text-xs font-mono font-medium",
                  contextColor(contextPercent).text,
                )}
              >
                {contextPercent}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  contextColor(contextPercent).bg,
                )}
                style={{ width: `${contextPercent}%` }}
              />
            </div>
          </div>
        </section>
      )}

      {/* ── Supervisor ─────────────────────────────────────────────────────── */}
      <section className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <Route className="h-3 w-3" />
          Supervisor
        </p>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-2 w-2 rounded-full",
              supervisorMode ? "bg-success" : "bg-muted-foreground/40",
            )}
          />
          <span className="text-xs">
            {supervisorMode ? "Active" : "Disabled"}
          </span>
        </div>
      </section>

      {/* ── Agents & Graphs ────────────────────────────────────────────────── */}
      <section className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <Bot className="h-3 w-3" />
          Agents & Graphs
          {(enabledAgents.length > 0 || enabledGraphs.length > 0) && (
            <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-auto">
              {enabledAgents.length + enabledGraphs.length}
            </Badge>
          )}
        </p>
        {enabledAgents.length === 0 && enabledGraphs.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No agents or graphs enabled
          </p>
        ) : (
          <div className="space-y-1">
            {enabledAgents.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5"
              >
                <Bot className="h-3 w-3 text-primary shrink-0" />
                <span className="text-xs truncate flex-1">{a.name}</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  agent
                </Badge>
              </div>
            ))}
            {enabledGraphs.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5"
              >
                <Workflow className="h-3 w-3 text-info shrink-0" />
                <span className="text-xs truncate flex-1">{g.name}</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  graph
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Routing Tab (ex-Supervisor) ─────────────────────────────────────────────

function RoutingTab({ data }: { data: SupervisorData | null }) {
  if (!data) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
        No routing data yet
      </div>
    );
  }

  const strategyLabel = (data.routingStrategy || "").replace(/_/g, " ");

  return (
    <div className="space-y-3">
      {/* Routing strategy */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Strategy
        </p>
        <Badge variant="outline" className="text-xs">
          <Route className="h-3 w-3 mr-1" />
          {strategyLabel || "Unknown"}
        </Badge>
      </div>

      {/* Delegated agent */}
      {data.delegatedTo && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Delegated to
          </p>
          <div className="flex items-center gap-1.5">
            <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-3 w-3 text-primary" />
            </div>
            <span className="text-sm font-medium">{data.delegatedTo}</span>
            {data.isEphemeral && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                ephemeral
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Ephemeral agent creation */}
      {data.ephemeralAgent && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Created Agent
          </p>
          <span className="text-sm">{data.ephemeralAgent.name}</span>
        </div>
      )}
    </div>
  );
}

// ─── Knowledge Tab ───────────────────────────────────────────────────────────

function scoreTextColor(pct: number): string {
  if (pct >= 80) return "text-success";
  if (pct >= 50) return "text-warning";
  return "text-muted-foreground";
}

function scoreBgColor(pct: number): string {
  if (pct >= 80) return "bg-success";
  if (pct >= 50) return "bg-warning";
  return "bg-muted-foreground/40";
}

function ChunkItem({ chunk }: { chunk: KnowledgeChunk }) {
  const [expanded, setExpanded] = useState(false);
  const scorePercent = Math.round(chunk.score * 100);

  return (
    <div
      className="rounded-md border border-border/50 p-2 space-y-1.5 cursor-pointer hover:bg-muted/30 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-1.5">
        <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium truncate flex-1">
          {chunk.documentFilename || "Unknown document"}
        </span>
        <span className={cn("text-[10px] font-mono shrink-0", scoreTextColor(scorePercent))}>
          {scorePercent}%
        </span>
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </div>

      {/* Score bar */}
      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", scoreBgColor(scorePercent))}
          style={{ width: `${scorePercent}%` }}
        />
      </div>

      <p className="text-[10px] text-muted-foreground">
        {chunk.collectionName} &middot; chunk #{chunk.chunkIndex}
      </p>

      {expanded && chunk.contentPreview && (
        <p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words bg-muted/50 rounded p-1.5 mt-1">
          {chunk.contentPreview}
        </p>
      )}
    </div>
  );
}

function KnowledgeTab({ data }: { data: KnowledgeData }) {
  if (data.status === "idle") {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
        No knowledge retrieved yet
      </div>
    );
  }

  if (data.status === "loading") {
    return (
      <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground text-xs">
        <Loader2 className="h-4 w-4 animate-spin" />
        Searching knowledge...
      </div>
    );
  }

  if (data.totalResults === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
        No knowledge results found
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Collections summary */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Collections ({data.collections.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {data.collections.map((c) => (
            <Badge
              key={c.collectionId}
              variant="secondary"
              className="text-[10px] gap-1"
            >
              <Database className="h-2.5 w-2.5" />
              {c.collectionName}
              <span className="text-muted-foreground">({c.chunkCount})</span>
            </Badge>
          ))}
        </div>
      </div>

      {/* Chunks */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Results ({data.totalResults})
        </p>
        <div className="space-y-1.5">
          {data.chunks.map((chunk) => (
            <ChunkItem key={chunk.chunkId} chunk={chunk} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Memory Tab ──────────────────────────────────────────────────────────────

function MemoryItem({ entry }: { entry: InsightsMemoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const stars = Math.round(entry.importance * 5);

  return (
    <div
      className="rounded-md border border-border/50 p-2 space-y-1 cursor-pointer hover:bg-muted/30 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-1.5">
        <Brain className="h-3 w-3 text-info mt-0.5 shrink-0" />
        <p
          className={cn(
            "text-xs flex-1",
            expanded ? "whitespace-pre-wrap break-words" : "line-clamp-2",
          )}
        >
          {entry.content}
        </p>
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className="text-[9px] px-1 py-0">
          {entry.scope}
        </Badge>
        <Badge variant="outline" className="text-[9px] px-1 py-0">
          {entry.tier}
        </Badge>
        {entry.category && (
          <Badge variant="secondary" className="text-[9px] px-1 py-0">
            {entry.category}
          </Badge>
        )}
        <span className="ml-auto flex items-center gap-0.5 text-warning">
          {Array.from({ length: stars }, (_, i) => (
            <Star key={i} className="h-2 w-2 fill-current" />
          ))}
        </span>
      </div>
    </div>
  );
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function MemoryTab({
  entries,
  contextWindow,
}: {
  entries: InsightsMemoryEntry[];
  contextWindow?: number | null;
}) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
        No memory entries used
      </div>
    );
  }

  const memoryTokens = entries.reduce((sum, e) => sum + estimateTokens(e.content), 0);
  const memoryPercent =
    contextWindow && memoryTokens > 0
      ? Math.min(Math.round((memoryTokens / contextWindow) * 100), 100)
      : null;

  return (
    <div className="space-y-3">
      {/* Memory context usage header */}
      <div className="rounded-md border border-border/50 bg-muted/20 p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {entries.length} {entries.length === 1 ? "entry" : "entries"} · ~{formatTokens(memoryTokens)} tokens
          </span>
          {memoryPercent !== null && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {memoryPercent}% of ctx
            </span>
          )}
        </div>
        {memoryPercent !== null && (
          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-info transition-all"
              style={{ width: `${Math.max(memoryPercent, 2)}%` }}
            />
          </div>
        )}
      </div>

      {/* Entries list */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Entries ({entries.length})
        </p>
        <div className="space-y-1.5">
          {entries.map((entry) => (
            <MemoryItem key={entry.id} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

interface InsightsPanelProps {
  supervisor: SupervisorData | null;
  knowledge: KnowledgeData;
  memory: InsightsMemoryEntry[];
  // Config data
  selectedModel: EngineModel | null;
  supervisorMode: boolean;
  enabledAgents: EngineAgent[];
  enabledGraphs: EngineGraph[];
  tokenUsage: TokenUsage | null;
}

const PANEL_TABS: ChatPanelTab[] = [
  { value: "config", label: "Config", icon: Settings2 },
  { value: "routing", label: "Routing", icon: Route },
  { value: "knowledge", label: "Knowledge", icon: BookOpen },
  { value: "memory", label: "Memory", icon: Brain },
];

export const InsightsPanel = memo(function InsightsPanel({
  supervisor,
  knowledge,
  memory,
  selectedModel,
  supervisorMode,
  enabledAgents,
  enabledGraphs,
  tokenUsage,
}: InsightsPanelProps) {
  return (
    <ChatPanel tabs={PANEL_TABS} defaultTab="config">
      <TabsContent value="config" className="m-0 p-3">
        <ConfigTab
          selectedModel={selectedModel}
          supervisorMode={supervisorMode}
          enabledAgents={enabledAgents}
          enabledGraphs={enabledGraphs}
          tokenUsage={tokenUsage}
        />
      </TabsContent>
      <TabsContent value="routing" className="m-0 p-3">
        <RoutingTab data={supervisor} />
      </TabsContent>
      <TabsContent value="knowledge" className="m-0 p-3">
        <KnowledgeTab data={knowledge} />
      </TabsContent>
      <TabsContent value="memory" className="m-0 p-3">
        <MemoryTab entries={memory} contextWindow={selectedModel?.context_window} />
      </TabsContent>
    </ChatPanel>
  );
});
