import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Plug, Plus, ChevronUp, Check, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
} from "@modularmind/ui";
import type {
  MCPServer,
  MCPCatalogEntry,
  MCPTool,
  MCPTestResult,
} from "@modularmind/api-client";
import { api } from "@modularmind/api-client";
import { ICON_MAP } from "./mcp/mcp-constants";
import { McpServerList } from "./mcp/McpServerList";
import { McpManualForm } from "./mcp/McpManualForm";
import { McpCatalog } from "./mcp/McpCatalog";
import { McpServerSettings } from "./mcp/McpServerSettings";

export function McpServersTab() {
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [newServerUrl, setNewServerUrl] = useState("");
  const [newServerName, setNewServerName] = useState("");
  const [mcpLoading, setMcpLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<MCPCatalogEntry[]>([]);
  const [showCatalog, setShowCatalog] = useState(false);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [catalogSecrets, setCatalogSecrets] = useState<Record<string, string>>({});
  const [selectedCatalogEntry, setSelectedCatalogEntry] = useState<MCPCatalogEntry | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [settingsServer, setSettingsServer] = useState<MCPServer | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    name: "",
    enabled: true,
    timeout_seconds: 30,
    api_key: "",
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsTools, setSettingsTools] = useState<MCPTool[]>([]);
  const [settingsToolsLoading, setSettingsToolsLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [serversRes, catalogRes] = await Promise.all([
          api.get<MCPServer[]>("/internal/mcp/servers"),
          api.get<MCPCatalogEntry[]>("/internal/mcp/catalog"),
        ]);
        setMcpServers(serversRes);
        setCatalog(catalogRes);
      } catch (err) {
        console.warn("[McpServers] endpoints not available:", err);
      }
      setLoading(false);
    })();
  }, []);

  const showTemporarySuccess = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const showTemporaryError = (message: string) => {
    setSaveError(message);
    setTimeout(() => setSaveError(null), 5000);
  };

  const handleAddMcpServer = async () => {
    if (!newServerName || !newServerUrl) return;
    setMcpLoading(true);
    try {
      const data = await api.post<MCPServer>("/internal/mcp/servers", {
        name: newServerName,
        url: newServerUrl,
      });
      setMcpServers([...mcpServers, data]);
      setNewServerName("");
      setNewServerUrl("");
      setShowManualForm(false);
      showTemporarySuccess();
    } catch (err) {
      showTemporaryError(err instanceof Error ? err.message : "Failed to add server");
    }
    setMcpLoading(false);
  };

  const handleRemoveMcpServer = async (serverId: string) => {
    try {
      await api.delete(`/internal/mcp/servers/${serverId}`);
      setMcpServers(mcpServers.filter((s) => s.id !== serverId));
      showTemporarySuccess();
    } catch (err) {
      console.error("[McpServers] remove:", err);
    }
  };

  const handleTestMcpServer = async (serverId: string) => {
    setTestingId(serverId);
    try {
      const res = await api.post<MCPTestResult>(`/internal/mcp/servers/${serverId}/test`);
      setMcpServers(
        mcpServers.map((s) =>
          s.id === serverId ? { ...s, connected: res.connected, tools_count: res.tools_count } : s,
        ),
      );
    } catch (err) {
      console.error("[McpServers] test:", err);
    }
    setTestingId(null);
  };

  const handleDeployFromCatalog = async () => {
    if (!selectedCatalogEntry) return;
    setDeployingId(selectedCatalogEntry.id);
    try {
      const data = await api.post<MCPServer>("/internal/mcp/deploy", {
        catalog_id: selectedCatalogEntry.id,
        secrets: catalogSecrets,
      });
      setMcpServers((prev) => [...prev, data]);
      setSelectedCatalogEntry(null);
      setCatalogSecrets({});
      showTemporarySuccess();
    } catch (err) {
      showTemporaryError(err instanceof Error ? err.message : "Deploy failed");
    }
    setDeployingId(null);
  };

  const handleOpenSettings = async (server: MCPServer) => {
    setSettingsServer(server);
    setSettingsForm({
      name: server.catalog_id === "github" ? "GitHub" : server.name,
      enabled: server.catalog_id === "github" ? true : server.enabled,
      timeout_seconds: server.catalog_id === "github" ? 30 : server.timeout_seconds,
      api_key: "",
    });
    setSettingsTools([]);

    const targetServer =
      server.catalog_id === "github"
        ? mcpServers.filter((s) => s.catalog_id === "github").find((s) => s.connected)
        : server.connected
          ? server
          : null;

    if (targetServer) {
      setSettingsToolsLoading(true);
      try {
        const tools = await api.get<MCPTool[]>(`/internal/mcp/servers/${targetServer.id}/tools`);
        setSettingsTools(tools);
      } catch (err) {
        console.warn("[McpServers] tools fetch:", err);
      }
      setSettingsToolsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settingsServer) return;
    setSettingsLoading(true);

    const updateData: Record<string, unknown> = {};
    if (settingsForm.name !== settingsServer.name) updateData.name = settingsForm.name;
    if (settingsForm.enabled !== settingsServer.enabled) updateData.enabled = settingsForm.enabled;
    if (settingsForm.timeout_seconds !== settingsServer.timeout_seconds)
      updateData.timeout_seconds = settingsForm.timeout_seconds;
    if (settingsForm.api_key) updateData.api_key = settingsForm.api_key;

    if (Object.keys(updateData).length > 0) {
      try {
        const data = await api.patch<MCPServer>(
          `/internal/mcp/servers/${settingsServer.id}`,
          updateData,
        );
        setMcpServers((prev) => prev.map((s) => (s.id === settingsServer.id ? data : s)));
        showTemporarySuccess();
      } catch (err) {
        showTemporaryError(err instanceof Error ? err.message : "Failed to save settings");
      }
    }

    setSettingsServer(null);
    setSettingsLoading(false);
  };

  const handleRefreshTools = async () => {
    if (!settingsServer) return;
    setSettingsToolsLoading(true);
    try {
      const testRes = await api.post<MCPTestResult>(
        `/internal/mcp/servers/${settingsServer.id}/test`,
      );
      setMcpServers((prev) =>
        prev.map((s) =>
          s.id === settingsServer.id
            ? { ...s, connected: testRes.connected, tools_count: testRes.tools_count }
            : s,
        ),
      );
    } catch (err) {
      console.error("[McpServers] refresh test:", err);
    }
    try {
      const tools = await api.get<MCPTool[]>(`/internal/mcp/servers/${settingsServer.id}/tools`);
      setSettingsTools(tools);
    } catch (err) {
      console.error("[McpServers] refresh tools:", err);
    }
    setSettingsToolsLoading(false);
  };

  const catalogByCategory = useMemo(() => {
    const grouped: Record<string, MCPCatalogEntry[]> = {};
    for (const entry of catalog) {
      if (!grouped[entry.category]) grouped[entry.category] = [];
      grouped[entry.category].push(entry);
    }
    return grouped;
  }, [catalog]);

  const deployedCatalogIds = useMemo(
    () => new Set(mcpServers.filter((s) => s.catalog_id).map((s) => s.catalog_id)),
    [mcpServers],
  );

  const catalogIconMap = useMemo(() => {
    const map = new Map<string, React.ElementType>();
    for (const entry of catalog) map.set(entry.id, ICON_MAP[entry.icon] || Plug);
    return map;
  }, [catalog]);

  const getServerIcon = useCallback(
    (server: MCPServer): React.ElementType => {
      if (server.catalog_id) return catalogIconMap.get(server.catalog_id) || Plug;
      return Plug;
    },
    [catalogIconMap],
  );

  const connectedCount = useMemo(() => mcpServers.filter((s) => s.connected).length, [mcpServers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plug className="h-5 w-5" />
              <CardTitle>MCP Servers</CardTitle>
              {mcpServers.length > 0 && (
                <Badge variant={connectedCount > 0 ? "success" : "secondary"} className="ml-1">
                  {connectedCount}/{mcpServers.length} connected
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {saveSuccess && (
                <span className="flex items-center gap-1 text-sm text-success">
                  <Check className="h-4 w-4" /> Saved
                </span>
              )}
              {saveError && (
                <span className="flex items-center gap-1 text-sm text-destructive">
                  <X className="h-4 w-4" /> {saveError}
                </span>
              )}
              <Button
                size="sm"
                onClick={() => {
                  setShowCatalog(!showCatalog);
                  setShowManualForm(false);
                }}
              >
                {showCatalog ? (
                  <ChevronUp className="mr-1 h-4 w-4" />
                ) : (
                  <Plus className="mr-1 h-4 w-4" />
                )}
                {showCatalog ? "Close Catalog" : "Add Server"}
              </Button>
            </div>
          </div>
          <CardDescription>
            Connect external tool servers via Model Context Protocol. Deploy from the catalog or add
            a custom server URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <McpServerList
            servers={mcpServers}
            testingId={testingId}
            getServerIcon={getServerIcon}
            onTest={handleTestMcpServer}
            onSettings={handleOpenSettings}
            onRemove={handleRemoveMcpServer}
          />

          {mcpServers.length === 0 && !showCatalog && !showManualForm && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No MCP servers configured. Click &quot;Add Server&quot; to get started.
            </p>
          )}

          {showManualForm && (
            <McpManualForm
              name={newServerName}
              url={newServerUrl}
              loading={mcpLoading}
              onNameChange={setNewServerName}
              onUrlChange={setNewServerUrl}
              onSubmit={handleAddMcpServer}
              onCancel={() => setShowManualForm(false)}
            />
          )}

          {showCatalog && (
            <McpCatalog
              catalog={catalog}
              catalogByCategory={catalogByCategory}
              deployedCatalogIds={deployedCatalogIds}
              selectedEntry={selectedCatalogEntry}
              secrets={catalogSecrets}
              deployingId={deployingId}
              onSelectEntry={setSelectedCatalogEntry}
              onSecretsChange={setCatalogSecrets}
              onDeploy={handleDeployFromCatalog}
              onSwitchToManual={() => {
                setShowManualForm(true);
                setShowCatalog(false);
              }}
            />
          )}
        </CardContent>
      </Card>

      {settingsServer && (
        <McpServerSettings
          server={settingsServer}
          form={settingsForm}
          tools={settingsTools}
          toolsLoading={settingsToolsLoading}
          saveLoading={settingsLoading}
          onFormChange={setSettingsForm}
          onSave={handleSaveSettings}
          onRefreshTools={handleRefreshTools}
          onClose={() => setSettingsServer(null)}
        />
      )}
    </>
  );
}
