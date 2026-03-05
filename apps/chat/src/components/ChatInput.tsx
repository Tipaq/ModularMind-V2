import { useState, useRef, useCallback, useLayoutEffect, useMemo, memo } from "react";
import {
  Bot,
  ChevronDown,
  FileUp,
  Paperclip,
  Plus,
  Search,
  Send,
  Square,
  Workflow,
  X,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  cn,
} from "@modularmind/ui";
import type { EngineAgent, EngineGraph, EngineModel } from "../hooks/useChatConfig";

const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_TEXTAREA_HEIGHT = 200;

export interface AttachedFile {
  file: File;
  id: string;
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isStreaming: boolean;
  onCancel: () => void;
  agents: EngineAgent[];
  graphs: EngineGraph[];
  enabledAgentIds: string[];
  enabledGraphIds: string[];
  onToggleAgent: (agentId: string) => void;
  onToggleGraph: (graphId: string) => void;
  onFilesChange?: (files: AttachedFile[]) => void;
  disabledReason?: string | null;
  // Model selector
  models?: EngineModel[];
  selectedModelId?: string | null;
  onModelChange?: (modelId: string) => void;
  modelLabel?: (m: EngineModel) => string;
  // Context / Compact
  onCompact?: () => void;
  compactDisabled?: boolean;
  contextPercent?: number | null;
}

function ContextMiniDonut({ percent }: { percent: number }) {
  const size = 18;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (percent / 100) * circumference;
  const color = percent >= 90 ? "hsl(var(--destructive))" : percent >= 70 ? "hsl(var(--warning))" : "hsl(var(--primary))";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${filled} ${circumference}`}
        strokeLinecap="round"
      />
    </svg>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export const ChatInput = memo(function ChatInput({
  value,
  onChange,
  onSend,
  isStreaming,
  onCancel,
  agents,
  graphs,
  enabledAgentIds,
  enabledGraphIds,
  onToggleAgent,
  onToggleGraph,
  onFilesChange,
  disabledReason,
  models,
  selectedModelId,
  onModelChange,
  modelLabel,
  onCompact,
  compactDisabled,
  contextPercent,
}: ChatInputProps) {
  const isSendDisabled = !!disabledReason;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Auto-resize textarea whenever value changes (synchronous to avoid flicker)
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const sh = el.scrollHeight;
    el.style.height = `${Math.min(sh, MAX_TEXTAREA_HEIGHT)}px`;
    el.style.overflowY = sh > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if ((value.trim() || attachedFiles.length > 0) && !isStreaming && !isSendDisabled) onSend();
      }
    },
    [value, attachedFiles, isStreaming, isSendDisabled, onSend],
  );

  const validateAndAddFiles = useCallback(
    (files: FileList | File[]) => {
      setFileError(null);
      const newFiles: AttachedFile[] = [];

      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_SIZE) {
          setFileError(`${file.name} is too large (max 25MB)`);
          continue;
        }
        if (file.type && !ALLOWED_FILE_TYPES.includes(file.type)) {
          const ext = file.name.split(".").pop()?.toLowerCase();
          const allowedExts = ["pdf", "txt", "csv", "md", "json", "docx", "png", "jpg", "jpeg", "gif", "webp"];
          if (ext && !allowedExts.includes(ext)) {
            setFileError(`${file.name}: unsupported file type`);
            continue;
          }
        }
        newFiles.push({
          file,
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });
      }

      if (newFiles.length > 0) {
        const updated = [...attachedFiles, ...newFiles];
        setAttachedFiles(updated);
        onFilesChange?.(updated);
      }
    },
    [attachedFiles, onFilesChange],
  );

  const removeFile = useCallback(
    (fileId: string) => {
      const updated = attachedFiles.filter((f) => f.id !== fileId);
      setAttachedFiles(updated);
      onFilesChange?.(updated);
    },
    [attachedFiles, onFilesChange],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        validateAndAddFiles(e.dataTransfer.files);
      }
    },
    [validateAndAddFiles],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        validateAndAddFiles(e.target.files);
      }
      e.target.value = "";
    },
    [validateAndAddFiles],
  );

  const filteredAgents = useMemo(() => {
    if (!search) return agents;
    const s = search.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(s) ||
        (a.description?.toLowerCase().includes(s) ?? false),
    );
  }, [agents, search]);

  const filteredGraphs = useMemo(() => {
    if (!search) return graphs;
    const s = search.toLowerCase();
    return graphs.filter(
      (g) =>
        g.name.toLowerCase().includes(s) ||
        (g.description?.toLowerCase().includes(s) ?? false),
    );
  }, [graphs, search]);

  const activeCount = enabledAgentIds.length + enabledGraphIds.length;
  const hasAgentsOrGraphs = agents.length > 0 || graphs.length > 0;

  // Available (non-embedding) models for the selector
  const chatModels = useMemo(
    () => (models ?? []).filter((m) => !m.is_embedding && m.is_available),
    [models],
  );
  const selectedModel = chatModels.find((m) => {
    if (!selectedModelId) return false;
    // Support both raw id and "provider:model_id" format
    return m.id === selectedModelId || `${m.provider}:${m.model_id}` === selectedModelId;
  });
  const getLabel = (m: EngineModel) =>
    modelLabel ? modelLabel(m) : (m.display_name || m.name);

  return (
    <div
      className={cn(
        "border-t shrink-0 transition-colors",
        isDragOver && "bg-primary/5 border-primary",
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Attached files */}
      {attachedFiles.length > 0 && (
        <div className="px-4 pt-2 flex flex-wrap gap-2">
          {attachedFiles.map((af) => (
            <div
              key={af.id}
              className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs"
            >
              <Paperclip className="h-3 w-3 text-muted-foreground" />
              <span className="max-w-[150px] truncate">{af.file.name}</span>
              <span className="text-muted-foreground">
                {formatFileSize(af.file.size)}
              </span>
              <button
                onClick={() => removeFile(af.id)}
                className="ml-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* File error */}
      {fileError && (
        <div className="px-4 pt-1">
          <p className="text-xs text-destructive">{fileError}</p>
        </div>
      )}

      {/* Input area — Claude-style: textarea on top, toolbar below */}
      <div className="p-4 pt-2">
        <div
          className={cn(
            "relative flex flex-col rounded-xl border bg-background transition-all",
            isDragOver
              ? "border-primary ring-2 ring-primary/20"
              : "focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50",
          )}
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            className="resize-none bg-transparent px-4 pt-3 pb-2 text-sm focus:outline-none min-h-[44px]"
            rows={1}
          />

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.csv,.md,.json,.docx,.png,.jpg,.jpeg,.gif,.webp"
            className="hidden"
            onChange={handleFileInputChange}
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
            {/* Left actions */}
            <div className="flex items-center gap-0.5">
              {/* Agent/Graph dropdown */}
              {hasAgentsOrGraphs && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground relative"
                      disabled={isStreaming}
                      title="Add agents or graphs"
                    >
                      <Plus className="h-4 w-4" />
                      {activeCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                          {activeCount}
                        </span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    side="top"
                    className="w-72"
                    onCloseAutoFocus={() => setSearch("")}
                  >
                    {/* Search input */}
                    <div className="flex items-center gap-2 px-2 pb-2 border-b">
                      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <input
                        type="text"
                        placeholder="Search agents & graphs..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                        autoFocus
                      />
                      {search && (
                        <button
                          onClick={() => setSearch("")}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {/* Scrollable list */}
                    <div className="max-h-[300px] overflow-y-auto overflow-x-hidden">
                      {filteredAgents.length > 0 && (
                        <>
                          <DropdownMenuLabel className="flex items-center gap-1.5 text-xs">
                            <Bot className="h-3.5 w-3.5" />
                            Agents
                            {enabledAgentIds.length > 0 && (
                              <span className="ml-auto text-[10px] font-normal text-primary">
                                {enabledAgentIds.length} selected
                              </span>
                            )}
                          </DropdownMenuLabel>
                          {filteredAgents.map((agent) => (
                            <DropdownMenuCheckboxItem
                              key={agent.id}
                              checked={enabledAgentIds.includes(agent.id)}
                              onCheckedChange={() => onToggleAgent(agent.id)}
                              onSelect={(e) => e.preventDefault()}
                              className="text-xs"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="truncate">{agent.name}</span>
                                {agent.description && (
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {agent.description}
                                  </p>
                                )}
                              </div>
                            </DropdownMenuCheckboxItem>
                          ))}
                        </>
                      )}
                      {filteredAgents.length > 0 && filteredGraphs.length > 0 && (
                        <DropdownMenuSeparator />
                      )}
                      {filteredGraphs.length > 0 && (
                        <>
                          <DropdownMenuLabel className="flex items-center gap-1.5 text-xs">
                            <Workflow className="h-3.5 w-3.5" />
                            Graphs
                            {enabledGraphIds.length > 0 && (
                              <span className="ml-auto text-[10px] font-normal text-primary">
                                {enabledGraphIds.length} selected
                              </span>
                            )}
                          </DropdownMenuLabel>
                          {filteredGraphs.map((graph) => (
                            <DropdownMenuCheckboxItem
                              key={graph.id}
                              checked={enabledGraphIds.includes(graph.id)}
                              onCheckedChange={() => onToggleGraph(graph.id)}
                              onSelect={(e) => e.preventDefault()}
                              className="text-xs"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="truncate">{graph.name}</span>
                                {graph.description && (
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {graph.description}
                                  </p>
                                )}
                              </div>
                            </DropdownMenuCheckboxItem>
                          ))}
                        </>
                      )}
                      {filteredAgents.length === 0 && filteredGraphs.length === 0 && (
                        <div className="py-4 text-center text-xs text-muted-foreground">
                          No results found
                        </div>
                      )}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* File upload button */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming}
                title="Attach files"
              >
                <Paperclip className="h-4 w-4" />
              </Button>

              {/* Context donut / Compact */}
              {onCompact && contextPercent != null && contextPercent > 0 && (
                <button
                  type="button"
                  onClick={onCompact}
                  disabled={compactDisabled || isStreaming}
                  title="Compact conversation"
                  className="flex items-center gap-1 h-8 px-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  <ContextMiniDonut percent={contextPercent} />
                  <span className="text-[11px] font-mono tabular-nums">{contextPercent}%</span>
                </button>
              )}
            </div>

            {/* Right: Model selector + Send / Cancel */}
            <div className="flex items-center gap-1">
              {/* Model selector */}
              {chatModels.length > 0 && onModelChange && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 px-2.5 text-muted-foreground hover:text-foreground gap-1 text-xs"
                      disabled={isStreaming}
                    >
                      <span className="max-w-[140px] truncate">
                        {selectedModel ? getLabel(selectedModel) : "Select model"}
                      </span>
                      <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="top" className="w-64">
                    <div className="max-h-[300px] overflow-y-auto">
                      {Object.entries(
                        chatModels.reduce<Record<string, EngineModel[]>>((acc, m) => {
                          (acc[m.provider] ??= []).push(m);
                          return acc;
                        }, {}),
                      ).map(([provider, providerModels]) => (
                        <div key={provider}>
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {provider}
                          </DropdownMenuLabel>
                          {providerModels.map((m) => (
                            <DropdownMenuCheckboxItem
                              key={m.id}
                              checked={
                                selectedModelId === m.id ||
                                selectedModelId === `${m.provider}:${m.model_id}`
                              }
                              onCheckedChange={() => onModelChange(m.id)}
                              className="text-xs"
                            >
                              {getLabel(m)}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </div>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Button
                onClick={isStreaming ? onCancel : onSend}
                disabled={isSendDisabled || (!isStreaming && !value.trim() && attachedFiles.length === 0)}
                size="icon"
                variant={isStreaming ? "destructive" : "default"}
                className="h-8 w-8 shrink-0 rounded-lg"
                title={disabledReason || undefined}
              >
                {isStreaming ? (
                  <Square className="h-3.5 w-3.5 fill-current" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Drag overlay hint */}
        {isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl pointer-events-none z-10">
            <div className="flex flex-col items-center gap-2 text-primary">
              <FileUp className="h-8 w-8" />
              <p className="text-sm font-medium">Drop files here</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
