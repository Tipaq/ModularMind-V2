"use client";

import { useState } from "react";
import { Loader2, Pencil, Route, Wrench } from "lucide-react";
import { Button } from "../button";
import { SectionCard } from "../section-card";
import { Switch } from "../switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../tooltip";
import { cn } from "../../lib/utils";
import { ALL_TOOL_CATEGORIES } from "../../lib/chat-config";
import type { SupervisorLayer } from "@modularmind/api-client";

interface LayerEditorProps {
  layer: SupervisorLayer;
  onSave: (key: string, content: string) => Promise<boolean>;
}

function LayerEditor({ layer, onSave }: LayerEditorProps) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(layer.content);
  const [saving, setSaving] = useState(false);

  const handleEdit = () => {
    setDraft(layer.content);
    setEditing(true);
    setExpanded(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(layer.key, draft);
    setSaving(false);
    if (ok) setEditing(false);
  };

  const charCount = layer.content?.length ?? 0;

  return (
    <div className="rounded-lg overflow-hidden bg-muted/15 border border-border/40">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-[11px] font-medium flex-1 truncate">{layer.label}</span>
        {charCount > 0 && !editing && (
          <span className="text-[10px] font-mono text-muted-foreground/60">{charCount > 999 ? `${(charCount / 1000).toFixed(1)}K` : charCount} chars</span>
        )}
        {!editing && (
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 shrink-0" onClick={handleEdit}>
            <Pencil className="h-2.5 w-2.5" />
          </Button>
        )}
      </div>

      {!editing && layer.content && (
        <div className="border-t border-border/30 relative cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <pre className={cn(
            "text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-words px-3 py-2 leading-relaxed",
            expanded ? "max-h-[400px] overflow-y-auto" : "line-clamp-12",
          )}>
            {layer.content}
          </pre>
          {!expanded && (
            <div className="absolute bottom-0 left-0 right-0 h-5 bg-gradient-to-t from-muted/30 to-transparent pointer-events-none" />
          )}
        </div>
      )}

      {editing && (
        <div className="border-t border-border/30 px-3 pb-2.5 pt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full min-h-[100px] max-h-[240px] text-[11px] font-mono bg-background border border-border/60 rounded-md p-2.5 resize-y leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground/50">{draft.length} chars</span>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" className="h-6 px-2.5 text-[11px]" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" className="h-6 px-2.5 text-[11px]" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface SupervisorSectionProps {
  supervisorMode: boolean;
  onToggleSupervisor: (enabled: boolean) => void;
  layers: SupervisorLayer[];
  onUpdateLayer: (key: string, content: string) => Promise<boolean>;
  supervisorToolCategories?: string[] | null;
  onToggleToolCategory?: (category: string, enabled: boolean) => void;
}

export function SupervisorSection({
  supervisorMode,
  onToggleSupervisor,
  layers,
  onUpdateLayer,
  supervisorToolCategories,
  onToggleToolCategory,
}: SupervisorSectionProps) {
  return (
    <SectionCard
      icon={Route}
      title="Supervisor"
      trailing={<Switch checked={supervisorMode} onCheckedChange={onToggleSupervisor} />}
    >
      {supervisorMode && layers.length > 0 && (
        <div className="space-y-1.5">
          {layers.map((layer) => (
            <LayerEditor key={layer.key} layer={layer} onSave={onUpdateLayer} />
          ))}
        </div>
      )}
      {supervisorMode && onToggleToolCategory && (
        <ToolCategorySection
          supervisorToolCategories={supervisorToolCategories}
          onToggleToolCategory={onToggleToolCategory}
        />
      )}
      {!supervisorMode && (
        <p className="text-[11px] text-muted-foreground">
          Messages are routed directly without supervisor orchestration.
        </p>
      )}
    </SectionCard>
  );
}

function ToolCategorySection({
  supervisorToolCategories,
  onToggleToolCategory,
}: {
  supervisorToolCategories?: string[] | null;
  onToggleToolCategory: (category: string, enabled: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Wrench className="size-3 text-muted-foreground" />
        <span className="text-[11px] font-medium text-foreground/80">Tool Categories</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {ALL_TOOL_CATEGORIES.map((cat) => {
          const isEnabled = supervisorToolCategories === null || supervisorToolCategories === undefined || supervisorToolCategories.includes(cat.id);
          return (
            <TooltipProvider key={cat.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onToggleToolCategory(cat.id, !isEnabled)}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                      isEnabled
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-muted/50 text-muted-foreground border border-transparent"
                    )}
                  >
                    {cat.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">
                  {cat.description}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    </div>
  );
}
