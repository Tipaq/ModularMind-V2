import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, MessageSquare, Check, X } from "lucide-react";
import {
  Button,
  Input,
  cn,
  UserButton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@modularmind/ui";
import { useAuthStore } from "@modularmind/ui";

export interface Conversation {
  id: string;
  title: string | null;
  agent_id: string | null;
  message_count: number;
  supervisor_mode?: boolean;
  config?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: ChatSidebarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deletingConv, setDeletingConv] = useState<Conversation | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startEdit = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditValue(conv.title || "New Chat");
  };

  const confirmEdit = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  return (
    <div className="w-[240px] h-full border-r border-border/50 flex flex-col bg-card/30 shrink-0">
      <div className="p-3 border-b border-border/50">
        <Button onClick={onCreate} size="sm" className="w-full gap-2">
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-xs">No conversations yet</p>
          </div>
        )}

        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={cn(
              "group flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-border/30 hover:bg-muted/50 transition-colors",
              activeId === conv.id && "bg-primary/10 border-l-2 border-l-primary",
            )}
            onClick={() => onSelect(conv.id)}
          >
            {editingId === conv.id ? (
              <div className="flex-1 flex items-center gap-1">
                <Input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  className="h-6 text-xs px-1"
                  onClick={(e) => e.stopPropagation()}
                />
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={(e) => { e.stopPropagation(); confirmEdit(); }}>
                  <Check className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={(e) => { e.stopPropagation(); cancelEdit(); }}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium truncate"
                    onDoubleClick={(e) => { e.stopPropagation(); startEdit(conv); }}
                  >
                    {conv.title || "New Chat"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {conv.message_count} msgs &middot; {timeAgo(conv.updated_at)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingConv(conv);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-border/50 p-3">
        {user && (
          <UserButton
            user={{ email: user.email, role: user.role }}
            onSignOut={() => {
              logout();
              window.location.href = "/login";
            }}
            onNavigate={(path) => navigate(`/${path}`)}
          />
        )}
      </div>

      {/* Delete confirmation modal */}
      <Dialog open={!!deletingConv} onOpenChange={(open) => { if (!open) setDeletingConv(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete conversation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deletingConv?.title || "this conversation"}&rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setDeletingConv(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (deletingConv) onDelete(deletingConv.id);
                setDeletingConv(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
