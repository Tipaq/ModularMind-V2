import { useState } from "react";
import {
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  cn,
} from "@modularmind/ui";
import {
  Route,
  BookOpen,
  Brain,
  FileText,
  X,
  ChevronDown,
  ChevronRight,
  Loader2,
  Database,
  Star,
  Sparkles,
} from "lucide-react";
import type {
  SupervisorData,
  KnowledgeData,
  KnowledgeChunk,
  MemoryEntry,
} from "../hooks/useRightPanel";

// ─── Supervisor Tab ──────────────────────────────────────────────────────────

function SupervisorTab({ data }: { data: SupervisorData | null }) {
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

function ChunkItem({ chunk }: { chunk: KnowledgeChunk }) {
  const [expanded, setExpanded] = useState(false);
  const scorePercent = Math.round(chunk.score * 100);
  const scoreColor =
    scorePercent >= 80
      ? "text-success"
      : scorePercent >= 50
        ? "text-warning"
        : "text-muted-foreground";

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
        <span className={cn("text-[10px] font-mono shrink-0", scoreColor)}>
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
          className={cn(
            "h-full rounded-full transition-all",
            scorePercent >= 80
              ? "bg-success"
              : scorePercent >= 50
                ? "bg-warning"
                : "bg-muted-foreground/40",
          )}
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

function MemoryItem({ entry }: { entry: MemoryEntry }) {
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

function MemoryTab({ entries }: { entries: MemoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
        No memory entries used
      </div>
    );
  }

  return (
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
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

interface RightPanelProps {
  supervisor: SupervisorData | null;
  knowledge: KnowledgeData;
  memory: MemoryEntry[];
  isStreaming: boolean;
  onClose: () => void;
}

export function RightPanel({
  supervisor,
  knowledge,
  memory,
  onClose,
}: RightPanelProps) {
  return (
    <div className="w-[320px] shrink-0 border-l border-border/50 flex flex-col bg-card/30">
      {/* Header */}
      <div className="h-14 border-b flex items-center justify-between px-3 shrink-0">
        <span className="text-sm font-medium">Insights</span>
        <button
          onClick={onClose}
          className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="knowledge" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-3 h-9 shrink-0">
          <TabsTrigger
            value="supervisor"
            className="text-xs gap-1 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2"
          >
            <Route className="h-3 w-3" />
            Supervisor
          </TabsTrigger>
          <TabsTrigger
            value="knowledge"
            className="text-xs gap-1 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2"
          >
            <BookOpen className="h-3 w-3" />
            Knowledge
          </TabsTrigger>
          <TabsTrigger
            value="memory"
            className="text-xs gap-1 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2"
          >
            <Brain className="h-3 w-3" />
            Memory
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <TabsContent value="supervisor" className="m-0 p-3">
            <SupervisorTab data={supervisor} />
          </TabsContent>
          <TabsContent value="knowledge" className="m-0 p-3">
            <KnowledgeTab data={knowledge} />
          </TabsContent>
          <TabsContent value="memory" className="m-0 p-3">
            <MemoryTab entries={memory} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
