import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Plus, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, Input } from "@modularmind/ui";
import { api } from "../lib/api";

interface UserSecret {
  key: string;
  label: string;
  masked_value: string;
  created_at: string;
}

export function Secrets() {
  const [secrets, setSecrets] = useState<UserSecret[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ items: UserSecret[] }>("/auth/me/secrets");
      setSecrets(data.items ?? []);
    } catch {
      setSecrets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSecrets(); }, [loadSecrets]);

  const handleAdd = useCallback(async () => {
    if (!newKey || !newValue) return;
    try {
      await api.post("/auth/me/secrets", { key: newKey, label: newLabel || newKey, value: newValue });
      setNewLabel("");
      setNewKey("");
      setNewValue("");
      setShowAdd(false);
      await loadSecrets();
    } catch { /* silently fail */ }
  }, [newKey, newValue, newLabel, loadSecrets]);

  const handleDelete = useCallback(async (key: string) => {
    try {
      await api.delete(`/auth/me/secrets/${key}`);
      setSecrets((prev) => prev.filter((s) => s.key !== key));
    } catch { /* silently fail */ }
  }, []);

  const toggleVisibility = useCallback((key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Secrets</h1>
          <p className="text-sm text-muted-foreground">Manage your personal API keys and credentials</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{secrets.length} keys</Badge>
          <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Key
          </Button>
        </div>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              placeholder="Key name (e.g. OPENAI_API_KEY)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
            <Input
              placeholder="Label (optional)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleAdd} disabled={!newKey || !newValue}>Save</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      ) : secrets.length === 0 && !showAdd ? (
        <EmptyState
          icon={KeyRound}
          title="No secrets yet"
          description="Add API keys and credentials for use in your conversations and automations."
          action={
            <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Your First Key
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {secrets.map((secret) => (
            <div
              key={secret.key}
              className="flex items-center justify-between rounded-xl border border-border/50 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{secret.label || secret.key}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {visibleKeys.has(secret.key) ? secret.masked_value : "****"}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleVisibility(secret.key)}
                >
                  {visibleKeys.has(secret.key) ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(secret.key)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Secrets;
