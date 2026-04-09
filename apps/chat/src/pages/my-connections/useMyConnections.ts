"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ConnectorData,
  ConnectorTypeDef,
  ConnectorCredentialData,
} from "@modularmind/api-client";
import { api } from "@modularmind/api-client";
import type { OAuthProvider } from "./types";

export function useMyConnections(projectId?: string) {
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

  const updateName = (typeId: string, name: string) => {
    setConnectorName((prev) => ({ ...prev, [typeId]: name }));
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

  const toggleSecretVisibility = (secretKey: string) => {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(secretKey)) next.delete(secretKey);
      else next.add(secretKey);
      return next;
    });
  };

  const clearError = (typeId: string) => {
    setTypeError((prev) => ({ ...prev, [typeId]: "" }));
  };

  const configuredOAuthProviders = oauthProviders.filter((p) => p.configured);

  return {
    connectorTypes,
    connectors,
    configuredOAuthProviders,
    loading,
    expandedType,
    formData,
    connectorName,
    creating,
    deleteTarget,
    deleting,
    visibleSecrets,
    typeError,
    setExpandedType,
    updateField,
    updateName,
    handleConnect,
    handleOAuthConnect,
    handleToggle,
    handleDeleteConfirm,
    setDeleteTarget,
    toggleSecretVisibility,
    clearError,
  };
}
