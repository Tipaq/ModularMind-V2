import { RefreshCw, Plus, X, ExternalLink, Plug } from "lucide-react";
import { Button, Badge, Input, Label } from "@modularmind/ui";
import type { MCPCatalogEntry } from "@modularmind/api-client";
import { ICON_MAP, CATEGORY_LABELS } from "./mcp-constants";

interface McpCatalogProps {
  catalogByCategory: Record<string, MCPCatalogEntry[]>;
  deployedCatalogIds: Set<string>;
  selectedEntry: MCPCatalogEntry | null;
  secrets: Record<string, string>;
  deployingId: string | null;
  onSelectEntry: (entry: MCPCatalogEntry | null) => void;
  onSecretsChange: (secrets: Record<string, string>) => void;
  onDeploy: () => void;
  onSwitchToManual: () => void;
}

function CatalogEntryDetail({
  entry,
  secrets,
  deployingId,
  onClose,
  onSecretsChange,
  onDeploy,
}: {
  entry: MCPCatalogEntry;
  secrets: Record<string, string>;
  deployingId: string | null;
  onClose: () => void;
  onSecretsChange: (secrets: Record<string, string>) => void;
  onDeploy: () => void;
}) {
  const CatIcon = ICON_MAP[entry.icon] || Plug;
  const hasRequiredSecrets = (entry.required_secrets?.length ?? 0) > 0;
  const isDeploying = deployingId === entry.id;
  const hasMissingRequired = (entry.required_secrets ?? []).some(
    (s) => s.required && !secrets[s.key]?.trim(),
  );

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CatIcon className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">{entry.name}</p>
            <p className="text-xs text-muted-foreground">{entry.description}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {hasRequiredSecrets && (
        <div className="space-y-2">
          <p className="text-xs font-medium">Required configuration</p>
          <div className="grid grid-cols-2 gap-3">
            {(entry.required_secrets ?? []).map((secret) => (
              <div key={secret.key} className="space-y-1">
                <Label className="text-xs font-mono">{secret.label}</Label>
                <Input
                  type={secret.is_secret ? "password" : "text"}
                  placeholder={secret.placeholder || "Enter value..."}
                  value={secrets[secret.key] || ""}
                  onChange={(e) =>
                    onSecretsChange({ ...secrets, [secret.key]: e.target.value })
                  }
                  className="text-xs h-8"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onDeploy} disabled={isDeploying || hasMissingRequired}>
          {isDeploying ? (
            <RefreshCw className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Plus className="h-3 w-3 mr-1" />
          )}
          Deploy
        </Button>
      </div>
    </div>
  );
}

function CatalogGrid({
  catalogByCategory,
  deployedCatalogIds,
  onSelectEntry,
  onSwitchToManual,
}: {
  catalogByCategory: Record<string, MCPCatalogEntry[]>;
  deployedCatalogIds: Set<string>;
  onSelectEntry: (entry: MCPCatalogEntry) => void;
  onSwitchToManual: () => void;
}) {
  const categories = Object.entries(catalogByCategory);

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">MCP Server Catalog</p>
        <Button variant="ghost" size="sm" onClick={onSwitchToManual}>
          <ExternalLink className="h-3 w-3 mr-1" />
          Add manually
        </Button>
      </div>
      {categories.map(([category, entries]) => (
        <div key={category} className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {CATEGORY_LABELS[category] || category}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {entries.map((entry) => {
              const CatIcon = ICON_MAP[entry.icon] || Plug;
              const isDeployed = deployedCatalogIds.has(entry.id);
              return (
                <button
                  key={entry.id}
                  className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/30 disabled:opacity-50"
                  disabled={isDeployed}
                  onClick={() => onSelectEntry(entry)}
                >
                  <CatIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{entry.name}</p>
                      {isDeployed && (
                        <Badge variant="success" className="text-[10px]">
                          Deployed
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {categories.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No servers available in the catalog.
        </p>
      )}
    </>
  );
}

export function McpCatalog({
  catalogByCategory,
  deployedCatalogIds,
  selectedEntry,
  secrets,
  deployingId,
  onSelectEntry,
  onSecretsChange,
  onDeploy,
  onSwitchToManual,
}: McpCatalogProps) {
  if (selectedEntry) {
    return (
      <div className="space-y-4">
        <CatalogEntryDetail
          entry={selectedEntry}
          secrets={secrets}
          deployingId={deployingId}
          onClose={() => {
            onSelectEntry(null);
            onSecretsChange({});
          }}
          onSecretsChange={onSecretsChange}
          onDeploy={onDeploy}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CatalogGrid
        catalogByCategory={catalogByCategory}
        deployedCatalogIds={deployedCatalogIds}
        onSelectEntry={onSelectEntry}
        onSwitchToManual={onSwitchToManual}
      />
    </div>
  );
}
