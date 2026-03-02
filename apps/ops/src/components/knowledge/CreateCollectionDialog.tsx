import { useState } from "react";
import { X, Plus } from "lucide-react";
import type { RAGScope } from "@modularmind/api-client";
import {
  Button, Badge, Input, Label, Textarea,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@modularmind/ui";
import { useAuthStore } from "../../stores/auth";

interface CreateData {
  name: string;
  description: string;
  scope: RAGScope;
  allowed_groups: string[];
  owner_user_id: string | null;
  chunk_size: number;
  chunk_overlap: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (data: CreateData) => Promise<void>;
}

export function CreateCollectionDialog({ open, onClose, onCreate }: Props) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin" || user?.role === "owner";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<RAGScope>(isAdmin ? "global" : "agent");
  const [groups, setGroups] = useState<string[]>([]);
  const [groupInput, setGroupInput] = useState("");
  const [chunkSize, setChunkSize] = useState(500);
  const [chunkOverlap, setChunkOverlap] = useState(50);
  const [submitting, setSubmitting] = useState(false);

  const addGroup = () => {
    const slug = groupInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (slug && !groups.includes(slug)) setGroups([...groups, slug]);
    setGroupInput("");
  };

  const handleClose = () => {
    setName(""); setDescription(""); setScope(isAdmin ? "global" : "agent");
    setGroups([]); setGroupInput("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        scope,
        allowed_groups: scope === "group" ? groups : [],
        owner_user_id: scope === "agent" ? (user?.id ?? null) : null,
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap,
      });
      handleClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Knowledge Collection</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="kc-name">Name</Label>
            <Input
              id="kc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. HR Policies, Engineering Runbook"
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="kc-desc">Description</Label>
            <Textarea
              id="kc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this collection contain?"
              rows={2}
            />
          </div>

          {/* Scope */}
          <div className="space-y-1.5">
            <Label>Access</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as RAGScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {isAdmin && (
                  <SelectItem value="global">Company — visible to all users</SelectItem>
                )}
                <SelectItem value="group">Group — specific teams only</SelectItem>
                <SelectItem value="agent">Personal — only me</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Group tags (only for GROUP scope) */}
          {scope === "group" && (
            <div className="space-y-1.5">
              <Label>Groups</Label>
              <div className="flex gap-2">
                <Input
                  value={groupInput}
                  onChange={(e) => setGroupInput(e.target.value)}
                  placeholder="e.g. hr, engineering, sales"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGroup(); } }}
                />
                <Button variant="outline" size="sm" type="button" onClick={addGroup}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {groups.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {groups.map((g) => (
                    <Badge key={g} variant="secondary" className="gap-1">
                      {g}
                      <button
                        onClick={() => setGroups(groups.filter((x) => x !== g))}
                        className="hover:text-destructive"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {groups.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Add at least one group slug</p>
              )}
            </div>
          )}

          {/* Chunking settings */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="kc-cs">Chunk size</Label>
              <Input
                id="kc-cs"
                type="number"
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                min={100}
                max={4000}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kc-co">Overlap</Label>
              <Input
                id="kc-co"
                type="number"
                value={chunkOverlap}
                onChange={(e) => setChunkOverlap(Number(e.target.value))}
                min={0}
                max={500}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !name.trim() ||
              submitting ||
              (scope === "group" && groups.length === 0)
            }
          >
            {submitting ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
