"use client";

import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { Plus, Search, Trash2, Check, X, MessageSquare, MoreHorizontal } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { cn, relativeTime } from "../lib/utils";
import { EmptyState } from "./empty-state";
import { ConfirmDialog } from "./confirm-dialog";

export interface ConversationListItem {
  id: string;
  title: string | null;
  message_count: number;
  updated_at: string;
}

export interface ConversationListProps {
  conversations: ConversationListItem[];
  loading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  title?: string;
  subtitle?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

interface ConversationRowProps {
  conversation: ConversationListItem;
  isEditing: boolean;
  editValue: string;
  onSelect: (id: string) => void;
  onStartEdit: (conv: ConversationListItem) => void;
  onConfirmEdit: () => void;
  onCancelEdit: () => void;
  onEditValueChange: (value: string) => void;
  onRequestDelete: (conv: ConversationListItem) => void;
}

const ConversationRow = memo(function ConversationRow({
  conversation,
  isEditing,
  editValue,
  onSelect,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onEditValueChange,
  onRequestDelete,
}: ConversationRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <div
      className="group flex items-center gap-3 px-4 py-3.5 cursor-pointer border-b border-border/30 hover:bg-muted/30 transition-colors"
      onClick={() => onSelect(conversation.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect(conversation.id)}
    >
      {isEditing ? (
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") onConfirmEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            className="h-8 text-sm"
            onClick={(e) => e.stopPropagation()}
          />
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={(e) => { e.stopPropagation(); onConfirmEdit(); }}>
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={(e) => { e.stopPropagation(); onCancelEdit(); }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-medium truncate"
              onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(conversation); }}
            >
              {conversation.title || "Untitled"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Last message {relativeTime(conversation.updated_at)}
            </p>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onStartEdit(conversation); }}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onRequestDelete(conversation); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
});

export const ConversationList = memo(function ConversationList({
  conversations,
  loading,
  searchQuery,
  onSearchChange,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  title = "Discussions",
  subtitle,
  emptyTitle = "No conversations yet",
  emptyDescription = "Start a new conversation to begin chatting.",
  className,
}: ConversationListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deletingConv, setDeletingConv] = useState<ConversationListItem | null>(null);

  const filtered = useMemo(() => {
    if (!searchQuery) return conversations;
    const lower = searchQuery.toLowerCase();
    return conversations.filter(
      (c) => (c.title || "").toLowerCase().includes(lower),
    );
  }, [conversations, searchQuery]);

  const startEdit = useCallback((conv: ConversationListItem) => {
    setEditingId(conv.id);
    setEditValue(conv.title || "Untitled");
  }, []);

  const confirmEdit = useCallback(() => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  }, [editingId, editValue, onRename]);

  const cancelEdit = useCallback(() => setEditingId(null), []);

  const handleDelete = useCallback(() => {
    if (deletingConv) {
      onDelete(deletingConv.id);
      setDeletingConv(null);
    }
  }, [deletingConv, onDelete]);

  return (
    <div className={cn("flex-1 flex flex-col overflow-hidden", className)}>
      <div className="px-6 pt-6 pb-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          <Button onClick={onCreate} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            New conversation
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-6 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/50" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <EmptyState
              icon={MessageSquare}
              title={searchQuery ? "No conversations match your search" : emptyTitle}
              description={searchQuery ? "Try a different search term." : emptyDescription}
            />
          </div>
        ) : (
          <div className="mx-6 rounded-xl border border-border/50 overflow-hidden">
            {filtered.map((conv) => (
              <ConversationRow
                key={conv.id}
                conversation={conv}
                isEditing={editingId === conv.id}
                editValue={editValue}
                onSelect={onSelect}
                onStartEdit={startEdit}
                onConfirmEdit={confirmEdit}
                onCancelEdit={cancelEdit}
                onEditValueChange={setEditValue}
                onRequestDelete={setDeletingConv}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deletingConv}
        onOpenChange={(open) => { if (!open) setDeletingConv(null); }}
        title={`Delete "${deletingConv?.title || "this conversation"}"?`}
        description="This conversation and all its messages will be permanently deleted."
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
});
