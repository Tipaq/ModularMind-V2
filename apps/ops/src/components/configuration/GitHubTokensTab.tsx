"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@modularmind/ui";
import { api } from "../../lib/api";

interface GitHubTokenResponse {
  id: string;
  label: string;
  token_preview: string;
  scopes: string[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

const SCOPE_OPTIONS = [
  "repo",
  "issues",
  "pull_requests",
  "actions",
  "packages",
  "admin",
  "gist",
  "notifications",
  "read:org",
  "workflow",
];

export function GitHubTokensTab() {
  const [tokens, setTokens] = useState<GitHubTokenResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newToken, setNewToken] = useState("");
  const [newScopes, setNewScopes] = useState<string[]>([]);
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTokens = async () => {
    try {
      const data = await api.get<GitHubTokenResponse[]>(
        "/internal/github-tokens"
      );
      setTokens(data);
    } catch {
      setError("Failed to load GitHub tokens");
    }
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      await loadTokens();
    })();
  }, []);

  const handleAdd = async () => {
    if (!newLabel.trim() || !newToken.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/internal/github-tokens", {
        label: newLabel.trim(),
        token: newToken.trim(),
        scopes: newScopes,
        is_default: newIsDefault,
      });
      setNewLabel("");
      setNewToken("");
      setNewScopes([]);
      setNewIsDefault(false);
      setShowAddForm(false);
      await loadTokens();
    } catch {
      setError("Failed to add token");
    }
    setSaving(false);
  };

  const handleDelete = async (tokenId: string, label: string) => {
    if (!confirm(`Remove the GitHub token "${label}"?`)) return;
    try {
      await api.delete(`/internal/github-tokens/${tokenId}`);
      await loadTokens();
    } catch {
      setError("Failed to delete token");
    }
  };

  const handleSetDefault = async (tokenId: string) => {
    try {
      await api.patch(`/internal/github-tokens/${tokenId}`, {
        is_default: true,
      });
      await loadTokens();
    } catch {
      setError("Failed to update token");
    }
  };

  const toggleScope = (scope: string) => {
    setNewScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          <button
            className="ml-2"
            onClick={() => setError(null)}
            type="button"
          >
            <X className="inline h-3 w-3" />
          </button>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>GitHub Personal Access Tokens</CardTitle>
            <CardDescription>
              Manage PATs for GitHub API integration. Agents use these tokens to
              access repositories, issues, and pull requests.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            variant={showAddForm ? "outline" : "default"}
          >
            {showAddForm ? (
              <X className="mr-1 h-4 w-4" />
            ) : (
              <Plus className="mr-1 h-4 w-4" />
            )}
            {showAddForm ? "Cancel" : "Add Token"}
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {showAddForm && (
            <div className="space-y-4 rounded-lg border border-dashed border-muted-foreground/30 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>
                    Label <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="e.g. CI Bot, Admin, Read-only"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>
                    Token <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type={tokenVisible ? "text" : "password"}
                      placeholder="ghp_..."
                      value={newToken}
                      onChange={(e) => setNewToken(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setTokenVisible(!tokenVisible)}
                    >
                      {tokenVisible ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Scopes</Label>
                <div className="flex flex-wrap gap-2">
                  {SCOPE_OPTIONS.map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => toggleScope(scope)}
                      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                        newScopes.includes(scope)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground"
                      }`}
                    >
                      {scope}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newIsDefault}
                    onChange={(e) => setNewIsDefault(e.target.checked)}
                    className="rounded"
                  />
                  Set as default token
                </label>
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={saving || !newLabel.trim() || !newToken.trim()}
                >
                  {saving ? (
                    <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-4 w-4" />
                  )}
                  Add Token
                </Button>
              </div>
            </div>
          )}

          {tokens.length === 0 && !showAddForm && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No GitHub tokens configured. Add one to enable GitHub tools for
              agents.
            </p>
          )}

          {tokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{token.label}</span>
                    {token.is_default && (
                      <Badge variant="success" className="text-xs">
                        <Star className="mr-0.5 h-3 w-3" />
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{token.token_preview}</span>
                    {token.scopes.length > 0 && (
                      <>
                        <span>·</span>
                        <span>{token.scopes.join(", ")}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!token.is_default && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSetDefault(token.id)}
                    title="Set as default"
                  >
                    <Star className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(token.id, token.label)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
