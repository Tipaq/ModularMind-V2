"use client";

import { useState, useRef, useCallback, useLayoutEffect, useMemo, memo } from "react";
import {
  ChevronDown,
  FileUp,
  Paperclip,
  Send,
  Square,
  X,
} from "lucide-react";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "./dropdown-menu";
import { cn, formatModelName } from "../lib/utils";
import { validateFiles, formatFileSize } from "../lib/file-validation";
import { ContextMiniDonut } from "./context-mini-donut";
import { AgentGraphSelector } from "./agent-graph-selector";
import type { EngineAgent, EngineGraph, EngineModel } from "@modularmind/api-client";
import type { AttachedFile } from "../types/chat";

const MAX_TEXTAREA_HEIGHT = 200;

export interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isStreaming: boolean;
  onCancel: () => void;
  agents?: EngineAgent[];
  graphs?: EngineGraph[];
  enabledAgentIds?: string[];
  enabledGraphIds?: string[];
  onToggleAgent?: (agentId: string) => void;
  onToggleGraph?: (graphId: string) => void;
  onFilesChange?: (files: AttachedFile[]) => void;
  disabledReason?: string | null;
  models?: EngineModel[];
  selectedModelId?: string | null;
  onModelChange?: (modelId: string) => void;
  modelLabel?: (m: EngineModel) => string;
  getModelId?: (m: EngineModel) => string;
  onCompact?: () => void;
  compactDisabled?: boolean;
  contextPercent?: number | null;
}

const defaultGetModelId = (m: EngineModel) => m.id;
const defaultModelLabel = (m: EngineModel) => formatModelName(m.model_id || m.name);

export const ChatInput = memo(function ChatInput({
  value, onChange, onSend, isStreaming, onCancel,
  agents = [], graphs = [], enabledAgentIds = [], enabledGraphIds = [],
  onToggleAgent, onToggleGraph, onFilesChange, disabledReason,
  models, selectedModelId, onModelChange,
  modelLabel = defaultModelLabel, getModelId = defaultGetModelId,
  onCompact, compactDisabled, contextPercent,
}: ChatInputProps) {
  const isSendDisabled = !!disabledReason;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

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

  const addValidatedFiles = useCallback(
    (files: FileList | File[]) => {
      const { validFiles, errorMessage } = validateFiles(files);
      setFileError(errorMessage);
      if (validFiles.length > 0) {
        const updated = [...attachedFiles, ...validFiles];
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

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) addValidatedFiles(e.dataTransfer.files);
  }, [addValidatedFiles]);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) addValidatedFiles(e.target.files);
      e.target.value = "";
    },
    [addValidatedFiles],
  );

  const hasAgentsOrGraphs = agents.length > 0 || graphs.length > 0;
  const canToggle = hasAgentsOrGraphs && onToggleAgent && onToggleGraph;

  const chatModels = useMemo(
    () => (models ?? []).filter((m) => !m.is_embedding && m.is_available),
    [models],
  );
  const selectedModel = chatModels.find((m) => {
    if (!selectedModelId) return false;
    return m.id === selectedModelId || `${m.provider}:${m.model_id}` === selectedModelId;
  });

  return (
    <div
      className={cn("shrink-0 transition-colors", isDragOver && "bg-primary/5 border-primary")}
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
    >
      {attachedFiles.length > 0 && (
        <div className="px-4 pt-2 flex flex-wrap gap-2">
          {attachedFiles.map((af) => (
            <div key={af.id} className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs">
              <Paperclip className="h-3 w-3 text-muted-foreground" />
              <span className="max-w-[150px] truncate">{af.file.name}</span>
              <span className="text-muted-foreground">{formatFileSize(af.file.size)}</span>
              <button onClick={() => removeFile(af.id)} className="ml-0.5 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {fileError && (
        <div className="px-4 pt-1"><p className="text-xs text-destructive">{fileError}</p></div>
      )}

      <div className="p-4 pt-2">
        <div className={cn(
          "relative flex flex-col rounded-xl border bg-muted transition-all",
          isDragOver ? "border-primary ring-2 ring-primary/20" : "focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50",
        )}>
          <textarea
            ref={textareaRef} value={value} onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown} placeholder="Ask anything..."
            className="resize-none bg-transparent px-4 pt-3 pb-2 text-sm focus:outline-none min-h-[44px]" rows={1}
          />
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.csv,.md,.json,.docx,.png,.jpg,.jpeg,.gif,.webp" className="hidden" onChange={handleFileInputChange} />

          <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
            <div className="flex items-center gap-0.5">
              {canToggle && (
                <AgentGraphSelector
                  agents={agents} graphs={graphs}
                  enabledAgentIds={enabledAgentIds} enabledGraphIds={enabledGraphIds}
                  onToggleAgent={onToggleAgent} onToggleGraph={onToggleGraph}
                  isStreaming={isStreaming}
                />
              )}
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => fileInputRef.current?.click()} disabled={isStreaming} title="Attach files"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              {onCompact && contextPercent != null && contextPercent > 0 && (
                <button type="button" onClick={onCompact} disabled={compactDisabled || isStreaming} title="Compact conversation"
                  className="flex items-center gap-1 h-8 px-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  <ContextMiniDonut percent={contextPercent} />
                  <span className="text-[11px] font-mono tabular-nums">{contextPercent}%</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1">
              {chatModels.length > 0 && onModelChange && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" className="h-8 px-2.5 text-muted-foreground hover:text-foreground gap-1 text-xs" disabled={isStreaming}>
                      <span className="max-w-[140px] truncate">{selectedModel ? modelLabel(selectedModel) : "Select model"}</span>
                      <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="top" className="w-64">
                    <div className="max-h-[300px] overflow-y-auto">
                      {Object.entries(
                        chatModels.reduce<Record<string, EngineModel[]>>((acc, m) => { (acc[m.provider] ??= []).push(m); return acc; }, {}),
                      ).map(([provider, providerModels]) => (
                        <div key={provider}>
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">{provider}</DropdownMenuLabel>
                          {providerModels.map((m) => {
                            const modelId = getModelId(m);
                            return (
                              <DropdownMenuCheckboxItem key={m.id}
                                checked={selectedModelId === modelId || selectedModelId === m.id || selectedModelId === `${m.provider}:${m.model_id}`}
                                onCheckedChange={() => onModelChange(modelId)} className="text-xs"
                              >
                                {modelLabel(m)}
                              </DropdownMenuCheckboxItem>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button onClick={isStreaming ? onCancel : onSend}
                disabled={isSendDisabled || (!isStreaming && !value.trim() && attachedFiles.length === 0)}
                size="icon" variant={isStreaming ? "destructive" : "default"}
                className="h-8 w-8 shrink-0 rounded-lg" title={disabledReason || undefined}
              >
                {isStreaming ? <Square className="h-3.5 w-3.5 fill-current" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>

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
