"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plug, Plus, Trash2, RefreshCw, Power, PowerOff,
  Eye, EyeOff, ChevronDown, ChevronUp, ExternalLink, LogIn,
} from "lucide-react";
import {
  Badge, Button, Card, CardContent, EmptyState,
  Input, Label, ConfirmDialog,
} from "@modularmind/ui";
import type {
  ConnectorData, ConnectorTypeDef, ConnectorCredentialData,
} from "@modularmind/api-client";
import { api } from "@modularmind/api-client";

interface OAuthProvider {
  provider_id: string;
  name: string;
  configured: boolean;
}

interface MyConnectionsProps {
  projectId?: string;
}

export function MyConnections({ projectId }: MyConnectionsProps) {
  const [connectorTypes, setConnectorTypes] = useState<ConnectorTypeDef[]>([]);
  const [connectors, setConnectors] = useState<ConnectorData[]>([]);
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({});
  const [connectorName, setConnectorName] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [typeError, setTypeError] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = projectId
        ? `/projects/${projectId}/connectors`
        : "/connectors/mine";

      const [typesRes, connRes, oauthRes] = await Promise.all([
        api.get<{ items: ConnectorTypeDef[] }>("/connectors/types"),
        api.get<{ items: ConnectorData[]; total: number }>(endpoint),
        api.get<OAuthProvider[]>("/connectors/oauth/providers").catch(() => []),
      ]);
      setConnectorTypes(typesRes.items);
      setConnectors(connRes.items);
      setOauthProviders(Array.isArray(oauthRes) ? oauthRes : []);
    } catch {
      setConnectorTypes([]);
      setConnectors([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateField = (typeId: string, key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [typeId]: { ...prev[typeId], [key]: value },
    }));
  };

  const handleConnect = async (typeDef: ConnectorTypeDef) => {
    const fields = formData[typeDef.type_id] || {};
    const name = connectorName[typeDef.type_id]
      || `My ${typeDef.name}`;

    for (const f of typeDef.fields) {
      if (f.is_required && !fields[f.key]?.trim()) {
        setTypeError((prev) => ({ ...prev, [typeDef.type_id]: `Please fill in: ${f.label}` }));
        return;
      }
    }

    setCreating(typeDef.type_id);
    try {
      const allFields = { ...fields };
      const secretFields = typeDef.fields.filter((f) => f.is_secret);
      const nonSecretFields = typeDef.fields.filter((f) => !f.is_secret);

      const testResult = await api.post<{ success: boolean; message: string }>(
        "/connectors/test-credentials",
        { connector_type: typeDef.type_id, fields: allFields },
      );

      if (!testResult.success) {
        setTypeError((prev) => ({ ...prev, [typeDef.type_id]: testResult.message }));
        setCreating(null);
        return;
      }

      const config: Record<string, string> = {};
      for (const f of nonSecretFields) {
        if (fields[f.key]) config[f.key] = fields[f.key];
      }

      const payload: Record<string, unknown> = {
        name,
        connector_type: typeDef.type_id,
        config,
      };
      if (projectId) payload.project_id = projectId;

      const data = await api.post<ConnectorData>("/connectors", payload);

      const secretValues: Record<string, string> = {};
      for (const f of secretFields) {
        if (fields[f.key]) secretValues[f.key] = fields[f.key];
      }

      if (Object.keys(secretValues).length > 0) {
        const credentialValue = Object.entries(secretValues)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${v}`)
          .join("|");

        await api.post<ConnectorCredentialData>(
          `/connectors/${data.id}/credentials`,
          {
            credential_type: "bot_token",
            label: `${typeDef.name} credentials`,
            value: credentialValue,
          },
        );
      }

      const refreshed = await api.get<ConnectorData>(
        `/connectors/${data.id}`
      );
      setConnectors((prev) => [refreshed, ...prev]);
      setFormData((prev) => ({ ...prev, [typeDef.type_id]: {} }));
      setConnectorName((prev) => ({ ...prev, [typeDef.type_id]: "" }));
      setExpandedType(null);
    } catch (err) {
      setTypeError((prev) => ({
        ...prev,
        [typeDef.type_id]: err instanceof Error ? err.message : "Failed to create connector",
      }));
    }
    setCreating(null);
  };

  const handleOAuthConnect = async (providerId: string) => {
    try {
      const params = new URLSearchParams({
        connector_name: "",
        project_id: projectId || "",
      });
      const data = await api.get<{ auth_url: string }>(
        `/connectors/oauth/authorize/${providerId}?${params.toString()}`
      );
      window.location.href = data.auth_url;
    } catch (err) {
      setTypeError((prev) => ({
        ...prev,
        [`oauth_${providerId}`]: err instanceof Error ? err.message : "OAuth failed",
      }));
    }
  };

  const configuredOAuthProviders = oauthProviders.filter((p) => p.configured);

  const handleToggle = async (connector: ConnectorData) => {
    try {
      const data = await api.put<ConnectorData>(
        `/connectors/${connector.id}`,
        { is_enabled: !connector.is_enabled },
      );
      setConnectors((prev) =>
        prev.map((c) => (c.id === connector.id ? data : c))
      );
    } catch {
      /* silently fail */
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/connectors/${deleteTarget}`);
      setConnectors((prev) => prev.filter((c) => c.id !== deleteTarget));
    } catch {
      /* silently fail */
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const scopeLabel = projectId ? "project" : "personal";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">
            {projectId ? "Project Connectors" : "My Connections"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {projectId
              ? "Connect external services to this project"
              : "Connect your personal services to ModularMind"}
          </p>
        </div>
        <Badge variant="outline">
          {connectors.length} {scopeLabel}
        </Badge>
      </div>

      {connectors.length > 0 && (
        <div className="space-y-2">
          {connectors.map((connector) => (
            <div
              key={connector.id}
              className="flex items-center justify-between rounded-xl border px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">
                    {connector.name}
                  </p>
                  <Badge
                    variant={connector.is_enabled ? "success" : "secondary"}
                    className="text-[10px]"
                  >
                    {connector.is_enabled ? "Active" : "Disabled"}
                  </Badge>
                  {connector.credential_count > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      Credentials linked
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {connector.connector_type}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggle(connector)}
                >
                  {connector.is_enabled ? (
                    <PowerOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Power className="h-4 w-4 text-success" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteTarget(connector.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {connectors.length === 0 && (
        <EmptyState
          icon={Plug}
          title={projectId ? "No project connectors" : "No connections yet"}
          description={
            projectId
              ? "Connect services like Slack or email to this project."
              : "Connect your personal services like Gmail, Slack, or custom APIs."
          }
        />
      )}

      {configuredOAuthProviders.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            Connect with one click
          </p>
          <div className="grid grid-cols-2 gap-3">
            {configuredOAuthProviders.map((provider) => (
              <Card key={provider.provider_id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <LogIn className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">{provider.name}</p>
                    </div>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleOAuthConnect(provider.provider_id)}
                    >
                      Connect
                    </Button>
                  </div>
                  {typeError[`oauth_${provider.provider_id}`] && (
                    <div className="mt-2 rounded border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                      {typeError[`oauth_${provider.provider_id}`]}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">
          {configuredOAuthProviders.length > 0
            ? "Or connect manually"
            : "Available services"}
        </p>
        {connectorTypes.map((typeDef) => {
          const isExpanded = expandedType === typeDef.type_id;

          return (
            <Card key={typeDef.type_id}>
              <button
                className="w-full text-left"
                onClick={() =>
                  setExpandedType(isExpanded ? null : typeDef.type_id)
                }
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Plug className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{typeDef.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {typeDef.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {typeDef.doc_url && (
                        <a
                          href={typeDef.doc_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </button>

              {isExpanded && (
                <div className="border-t px-4 pb-4 pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {typeDef.fields.map((field) => {
                      const secretKey = `${typeDef.type_id}-${field.key}`;
                      const isPassword = field.is_secret;
                      const isVisible = visibleSecrets.has(secretKey);

                      return (
                        <div key={field.key} className="space-y-1">
                          <Label className="text-xs">
                            {field.label}
                            {field.is_required && (
                              <span className="text-destructive ml-0.5">*</span>
                            )}
                          </Label>
                          <div className="relative">
                            <Input
                              type={isPassword && !isVisible ? "password" : "text"}
                              placeholder={field.placeholder}
                              value={formData[typeDef.type_id]?.[field.key] || ""}
                              onChange={(e) =>
                                updateField(typeDef.type_id, field.key, e.target.value)
                              }
                              className="text-xs h-8 pr-8"
                            />
                            {isPassword && (
                              <button
                                type="button"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  setVisibleSecrets((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(secretKey)) next.delete(secretKey);
                                    else next.add(secretKey);
                                    return next;
                                  });
                                }}
                              >
                                {isVisible ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {typeError[typeDef.type_id] && (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {typeError[typeDef.type_id]}
                    </div>
                  )}

                  <div className="flex items-end gap-3">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Connection Name</Label>
                      <Input
                        placeholder={`My ${typeDef.name}`}
                        value={connectorName[typeDef.type_id] || ""}
                        onChange={(e) =>
                          setConnectorName((prev) => ({
                            ...prev,
                            [typeDef.type_id]: e.target.value,
                          }))
                        }
                        className="text-xs h-8"
                      />
                    </div>
                    <Button
                      onClick={() => {
                        setTypeError((prev) => ({ ...prev, [typeDef.type_id]: "" }));
                        handleConnect(typeDef);
                      }}
                      disabled={creating === typeDef.type_id}
                      className="h-8 text-xs"
                    >
                      {creating === typeDef.type_id ? (
                        <>
                          <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3 mr-1" />
                          Connect
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Remove connection?"
        description="This will disconnect this service. You can reconnect it later."
        confirmLabel="Remove"
        destructive
        loading={deleting}
        onConfirm={handleDeleteConfirm}
      />

    </div>
  );
}

export default MyConnections;
