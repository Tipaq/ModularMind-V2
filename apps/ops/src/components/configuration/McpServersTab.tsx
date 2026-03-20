import { useEffect, useState } from "react";
import {
  RefreshCw,
  Plug,
  Plus,
  ChevronUp,
  ExternalLink,
  Trash2,
  Check,
  X,
  Search,
  MessageSquare,
  HardDrive,
  Mail,
  Calendar,
  BookOpen,
  Database,
  Kanban,
  Ticket,
  Github,
  Flame,
  Brain,
  Folder,
  Send,
  BarChart,
  GitBranch,
  AlertTriangle,
  Cloud,
  CreditCard,
  Briefcase,
  ShoppingCart,
  MessageCircle,
  FileText,
  LayoutGrid,
  Terminal,
  Globe,
  Settings,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Input,
  Label,
  Switch,
  cn,
} from "@modularmind/ui";
import type {
  MCPServer,
  MCPCatalogEntry,
  MCPTool,
  MCPTestResult,
} from "@modularmind/api-client";
import { api } from "../../lib/api";

const ICON_MAP: Record<string, React.ElementType> = {
  search: Search,
  "message-square": MessageSquare,
  "hard-drive": HardDrive,
  mail: Mail,
  calendar: Calendar,
  "book-open": BookOpen,
  database: Database,
  kanban: Kanban,
  ticket: Ticket,
  github: Github,
  flame: Flame,
  brain: Brain,
  folder: Folder,
  send: Send,
  "bar-chart": BarChart,
  "git-branch": GitBranch,
  "alert-triangle": AlertTriangle,
  cloud: Cloud,
  "credit-card": CreditCard,
  briefcase: Briefcase,
  "shopping-cart": ShoppingCart,
  "message-circle": MessageCircle,
  "file-text": FileText,
  "layout-grid": LayoutGrid,
  terminal: Terminal,
  globe: Globe,
};

const CATEGORY_LABELS: Record<string, string> = {
  search: "Search",
  communication: "Communication",
  productivity: "Productivity",
  database: "Database",
  "project-management": "Project Management",
  development: "Development",
  utility: "Utility",
  devops: "DevOps",
  "data-analytics": "Data & Analytics",
  ai: "AI / ML",
  automation: "Automation",
  finance: "Finance",
};

export default function McpServersTab() {
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
  const [catalogSecrets, setCatalogSecrets] = useState<Record<string, string>>(
    {},
  );
  const [selectedCatalogEntry, setSelectedCatalogEntry] =
    useState<MCPCatalogEntry | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Settings dialog state
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

  // GitHub unified settings state
  const [githubTokens, setGithubTokens] = useState({
    read: "",
    write: "",
    admin: "",
  });
  const [githubSaving, setGithubSaving] = useState(false);

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
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to add server");
      setTimeout(() => setSaveError(null), 5000);
    }
    setMcpLoading(false);
  };

  const handleRemoveMcpServer = async (serverId: string) => {
    try {
      await api.delete(`/internal/mcp/servers/${serverId}`);
      setMcpServers(mcpServers.filter((s) => s.id !== serverId));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("[McpServers] remove:", err);
    }
  };

  const handleTestMcpServer = async (serverId: string) => {
    setTestingId(serverId);
    try {
      const res = await api.post<MCPTestResult>(
        `/internal/mcp/servers/${serverId}/test`,
      );
      setMcpServers(
        mcpServers.map((s) =>
          s.id === serverId
            ? { ...s, connected: res.connected, tools_count: res.tools_count }
            : s,
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
      if (selectedCatalogEntry.setup_flow === "github_tiered") {
        // Tiered deploy — creates multiple servers
        const data = await api.post<MCPServer[]>(
          "/internal/mcp/deploy/github",
          {
            catalog_id: selectedCatalogEntry.id,
            secrets: catalogSecrets,
          },
        );
        setMcpServers((prev) => [...prev, ...data]);
      } else {
        const data = await api.post<MCPServer>("/internal/mcp/deploy", {
          catalog_id: selectedCatalogEntry.id,
          secrets: catalogSecrets,
        });
        setMcpServers((prev) => [...prev, data]);
      }
      setSelectedCatalogEntry(null);
      setCatalogSecrets({});
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Deploy failed");
      setTimeout(() => setSaveError(null), 5000);
    }
    setDeployingId(null);
  };

  const handleOpenSettings = async (server: MCPServer) => {
    // For GitHub servers, open a unified panel for all tiers
    if (server.catalog_id === "github") {
      setSettingsServer(server);
      setGithubTokens({ read: "", write: "", admin: "" });
      setSettingsForm({
        name: "GitHub",
        enabled: true,
        timeout_seconds: 30,
        api_key: "",
      });
      // Load tools from the first connected GitHub server
      setSettingsTools([]);
      const githubServers = mcpServers.filter(
        (s) => s.catalog_id === "github",
      );
      const connectedGh = githubServers.find((s) => s.connected);
      if (connectedGh) {
        setSettingsToolsLoading(true);
        try {
          const tools = await api.get<MCPTool[]>(
            `/internal/mcp/servers/${connectedGh.id}/tools`,
          );
          setSettingsTools(tools);
        } catch (err) {
          console.warn("[McpServers] tools fetch:", err);
        }
        setSettingsToolsLoading(false);
      }
      return;
    }
    setSettingsServer(server);
    setSettingsForm({
      name: server.name,
      enabled: server.enabled,
      timeout_seconds: server.timeout_seconds,
      api_key: "",
    });
    setSettingsTools([]);
    if (server.connected) {
      setSettingsToolsLoading(true);
      try {
        const tools = await api.get<MCPTool[]>(
          `/internal/mcp/servers/${server.id}/tools`,
        );
        setSettingsTools(tools);
      } catch (err) {
        console.warn("[McpServers] tools fetch:", err);
      }
      setSettingsToolsLoading(false);
    }
  };

  const handleSaveGithubTokens = async () => {
    setGithubSaving(true);
    try {
      // Update existing tier tokens via PATCH
      const githubServers = mcpServers.filter(
        (s) => s.catalog_id === "github",
      );
      for (const gs of githubServers) {
        const token = githubTokens[gs.access_tier as keyof typeof githubTokens];
        if (token?.trim()) {
          const updated = await api.patch<MCPServer>(
            `/internal/mcp/servers/${gs.id}`,
            { api_key: token },
          );
          setMcpServers((prev) =>
            prev.map((s) => (s.id === gs.id ? updated : s)),
          );
        }
      }
      // Deploy new tiers that don't exist yet
      const existingTiers = new Set(
        githubServers.map((s) => s.access_tier),
      );
      const newSecrets: Record<string, string> = {};
      if (githubTokens.read.trim() && !existingTiers.has("read"))
        newSecrets.GITHUB_TOKEN_READ = githubTokens.read;
      if (githubTokens.write.trim() && !existingTiers.has("write"))
        newSecrets.GITHUB_TOKEN_WRITE = githubTokens.write;
      if (githubTokens.admin.trim() && !existingTiers.has("admin"))
        newSecrets.GITHUB_TOKEN_ADMIN = githubTokens.admin;

      if (Object.keys(newSecrets).length > 0) {
        const created = await api.post<MCPServer[]>(
          "/internal/mcp/deploy/github",
          { catalog_id: "github", secrets: newSecrets },
        );
        setMcpServers((prev) => [...prev, ...created]);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      setGithubTokens({ read: "", write: "", admin: "" });
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save GitHub tokens",
      );
      setTimeout(() => setSaveError(null), 5000);
    }
    setGithubSaving(false);
  };

  const handleSaveSettings = async () => {
    if (!settingsServer) return;
    setSettingsLoading(true);

    const updateData: Record<string, unknown> = {};
    if (settingsForm.name !== settingsServer.name)
      updateData.name = settingsForm.name;
    if (settingsForm.enabled !== settingsServer.enabled)
      updateData.enabled = settingsForm.enabled;
    if (settingsForm.timeout_seconds !== settingsServer.timeout_seconds)
      updateData.timeout_seconds = settingsForm.timeout_seconds;
    if (settingsForm.api_key) updateData.api_key = settingsForm.api_key;

    if (Object.keys(updateData).length > 0) {
      try {
        const data = await api.patch<MCPServer>(
          `/internal/mcp/servers/${settingsServer.id}`,
          updateData,
        );
        setMcpServers((prev) =>
          prev.map((s) => (s.id === settingsServer.id ? data : s)),
        );
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } catch (err) {
        setSaveError(
          err instanceof Error ? err.message : "Failed to save settings",
        );
        setTimeout(() => setSaveError(null), 5000);
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
            ? {
                ...s,
                connected: testRes.connected,
                tools_count: testRes.tools_count,
              }
            : s,
        ),
      );
    } catch (err) {
      console.error("[McpServers] refresh test:", err);
    }
    try {
      const tools = await api.get<MCPTool[]>(
        `/internal/mcp/servers/${settingsServer.id}/tools`,
      );
      setSettingsTools(tools);
    } catch (err) {
      console.error("[McpServers] refresh tools:", err);
    }
    setSettingsToolsLoading(false);
  };

  const catalogByCategory = catalog.reduce<
    Record<string, MCPCatalogEntry[]>
  >((acc, entry) => {
    const cat = entry.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(entry);
    return acc;
  }, {});

  const deployedCatalogIds = new Set(
    mcpServers.filter((s) => s.catalog_id).map((s) => s.catalog_id),
  );

  const getServerIcon = (server: MCPServer): React.ElementType => {
    if (server.catalog_id) {
      const entry = catalog.find((c) => c.id === server.catalog_id);
      if (entry) return ICON_MAP[entry.icon] || Plug;
    }
    return Plug;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const connectedCount = mcpServers.filter((s) => s.connected).length;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plug className="h-5 w-5" />
              <CardTitle>MCP Servers</CardTitle>
              {mcpServers.length > 0 && (
                <Badge
                  variant={connectedCount > 0 ? "success" : "secondary"}
                  className="ml-1"
                >
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
            Connect external tool servers via Model Context Protocol.
            Deploy from the catalog or add a custom server URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Active Servers */}
          {mcpServers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Active Servers
              </p>
              <div className="space-y-1.5">
                {mcpServers.map((server) => {
                  const IconComp = getServerIcon(server);
                  const isTesting = testingId === server.id;
                  return (
                    <div
                      key={server.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <IconComp className="h-5 w-5 text-muted-foreground" />
                          <span
                            className={cn(
                              "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background",
                              server.connected ? "bg-success" : "bg-muted-foreground",
                            )}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">
                              {server.name}
                            </p>
                            {server.connected && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 font-normal"
                              >
                                {server.tools_count} tool
                                {server.tools_count !== 1 ? "s" : ""}
                              </Badge>
                            )}
                            {!server.connected && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 font-normal"
                              >
                                Offline
                              </Badge>
                            )}
                            {server.managed && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground"
                              >
                                Auto
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground"
                            >
                              {server.transport === "stdio" ? "Subprocess" : "HTTP"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {server.transport === "stdio"
                              ? "Local subprocess"
                              : server.managed
                                ? "Managed sidecar"
                                : server.url}
                            {server.description &&
                              ` \u2014 ${server.description}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-3 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTestMcpServer(server.id)}
                          disabled={isTesting}
                          title="Test connection"
                        >
                          {isTesting ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenSettings(server)}
                          title="Settings"
                        >
                          <Settings className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMcpServer(server.id)}
                          title="Remove"
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {mcpServers.length === 0 && !showCatalog && !showManualForm && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No MCP servers configured. Click "Add Server" to get started.
            </p>
          )}

          {/* Manual add form */}
          {showManualForm && (
            <div className="rounded-lg border border-dashed p-4 space-y-3">
              <p className="text-sm font-medium">Add MCP Server</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Server Name</Label>
                  <Input
                    placeholder="My MCP Server"
                    value={newServerName}
                    onChange={(e) => setNewServerName(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Server URL</Label>
                  <Input
                    placeholder="http://localhost:3100/mcp"
                    value={newServerUrl}
                    onChange={(e) => setNewServerUrl(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowManualForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddMcpServer}
                  disabled={mcpLoading || !newServerName || !newServerUrl}
                >
                  {mcpLoading ? (
                    <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Plus className="h-3 w-3 mr-1" />
                  )}
                  Add
                </Button>
              </div>
            </div>
          )}

          {/* Catalog */}
          {showCatalog && (
            <div className="space-y-4">
              {selectedCatalogEntry ? (
                <div className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const CatIcon =
                          ICON_MAP[selectedCatalogEntry.icon] || Plug;
                        return (
                          <CatIcon className="h-5 w-5 text-muted-foreground" />
                        );
                      })()}
                      <div>
                        <p className="font-medium">
                          {selectedCatalogEntry.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedCatalogEntry.description}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedCatalogEntry(null);
                        setCatalogSecrets({});
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {(selectedCatalogEntry.required_secrets?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium">
                        Required configuration
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {(selectedCatalogEntry.required_secrets ?? []).map((secret) => (
                          <div key={secret.key} className="space-y-1">
                            <Label className="text-xs font-mono">
                              {secret.label}
                            </Label>
                            <Input
                              type={secret.is_secret ? "password" : "text"}
                              placeholder={secret.placeholder || "Enter value..."}
                              value={catalogSecrets[secret.key] || ""}
                              onChange={(e) =>
                                setCatalogSecrets((prev) => ({
                                  ...prev,
                                  [secret.key]: e.target.value,
                                }))
                              }
                              className="text-xs h-8"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      onClick={handleDeployFromCatalog}
                      disabled={
                        deployingId === selectedCatalogEntry.id ||
                        (selectedCatalogEntry.setup_flow === "github_tiered"
                          ? !Object.values(catalogSecrets).some((v) => v?.trim())
                          : (selectedCatalogEntry.required_secrets ?? []).some(
                              (s) => s.required && !catalogSecrets[s.key]?.trim(),
                            ))
                      }
                    >
                      {deployingId === selectedCatalogEntry.id ? (
                        <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Plus className="h-3 w-3 mr-1" />
                      )}
                      Deploy
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">MCP Server Catalog</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowManualForm(true);
                        setShowCatalog(false);
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Add manually
                    </Button>
                  </div>
                  {Object.entries(catalogByCategory).map(
                    ([category, entries]) => (
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
                                onClick={() => setSelectedCatalogEntry(entry)}
                              >
                                <CatIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium truncate">
                                      {entry.name}
                                    </p>
                                    {isDeployed && (
                                      <Badge
                                        variant="success"
                                        className="text-[10px]"
                                      >
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
                    ),
                  )}
                  {catalog.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No servers available in the catalog.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings Dialog (inline panel) */}
      {settingsServer && settingsServer.catalog_id === "github" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Github className="h-5 w-5" />
                <CardTitle className="text-base">
                  GitHub Integration
                </CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSettingsServer(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>
              Configure access tokens for each permission tier. Agents are
              assigned a tier based on their permissions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Active tiers summary */}
            <div className="flex gap-2 flex-wrap">
              {(["read", "write", "admin"] as const).map((tier) => {
                const gs = mcpServers.find(
                  (s) => s.catalog_id === "github" && s.access_tier === tier,
                );
                return (
                  <Badge
                    key={tier}
                    variant={gs ? (gs.connected ? "success" : "secondary") : "outline"}
                    className="text-xs"
                  >
                    {tier.charAt(0).toUpperCase() + tier.slice(1)}
                    {gs ? (gs.connected ? " — Connected" : " — Offline") : " — Not configured"}
                  </Badge>
                );
              })}
            </div>

            {/* Token inputs */}
            <div className="space-y-3">
              {(
                [
                  { tier: "read", label: "Read Token", desc: "repo:status, public_repo, read:org" },
                  { tier: "write", label: "Write Token", desc: "repo, write:org, gist" },
                  { tier: "admin", label: "Admin Token", desc: "repo, admin:org, admin:repo_hook, workflow" },
                ] as const
              ).map(({ tier, label, desc }) => {
                const gs = mcpServers.find(
                  (s) => s.catalog_id === "github" && s.access_tier === tier,
                );
                return (
                  <div key={tier} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs font-medium">{label}</Label>
                      {gs && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 font-normal"
                        >
                          {gs.connected
                            ? `${gs.tools_count} tools`
                            : "offline"}
                        </Badge>
                      )}
                    </div>
                    <Input
                      type="password"
                      placeholder={
                        gs ? "Leave blank to keep current" : "ghp_..."
                      }
                      value={githubTokens[tier]}
                      onChange={(e) =>
                        setGithubTokens((prev) => ({
                          ...prev,
                          [tier]: e.target.value,
                        }))
                      }
                      className="text-xs h-8"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Scopes: {desc}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Tools list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Available Tools
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefreshTools}
                  disabled={settingsToolsLoading}
                >
                  <RefreshCw
                    className={cn(
                      "h-3 w-3 mr-1",
                      settingsToolsLoading && "animate-spin",
                    )}
                  />
                  Refresh
                </Button>
              </div>
              {settingsToolsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : settingsTools.length > 0 ? (
                <div className="space-y-1">
                  {settingsTools.map((tool, index) => (
                    <div
                      key={`${tool.name}-${index}`}
                      className="rounded border px-3 py-2 text-xs"
                    >
                      <p className="font-medium">{tool.name}</p>
                      {tool.description && (
                        <p className="text-muted-foreground mt-0.5">
                          {tool.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Connect at least one tier to discover tools
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                variant="ghost"
                onClick={() => setSettingsServer(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveGithubTokens}
                disabled={
                  githubSaving ||
                  !Object.values(githubTokens).some((v) => v.trim())
                }
              >
                {githubSaving ? (
                  <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Check className="h-3 w-3 mr-1" />
                )}
                Save Tokens
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {settingsServer && settingsServer.catalog_id !== "github" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Settings: {settingsServer.name}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSettingsServer(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Server Name</Label>
                <Input
                  value={settingsForm.name}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="text-xs h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Timeout (seconds)</Label>
                <Input
                  type="number"
                  min={5}
                  max={120}
                  value={settingsForm.timeout_seconds}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({
                      ...prev,
                      timeout_seconds: parseInt(e.target.value) || 30,
                    }))
                  }
                  className="text-xs h-8"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enabled</p>
                <p className="text-xs text-muted-foreground">
                  Disable to temporarily stop using this server
                </p>
              </div>
              <Switch
                checked={settingsForm.enabled}
                onCheckedChange={(checked) =>
                  setSettingsForm((prev) => ({ ...prev, enabled: checked }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">API Key (optional)</Label>
              <Input
                type="password"
                placeholder="Leave blank to keep current"
                value={settingsForm.api_key}
                onChange={(e) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    api_key: e.target.value,
                  }))
                }
                className="text-xs h-8"
              />
            </div>

            {/* Tools list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Available Tools
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefreshTools}
                  disabled={settingsToolsLoading}
                >
                  <RefreshCw
                    className={cn("h-3 w-3 mr-1", settingsToolsLoading && "animate-spin")}
                  />
                  Refresh
                </Button>
              </div>
              {settingsToolsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : settingsTools.length > 0 ? (
                <div className="space-y-1">
                  {settingsTools.map((tool, index) => (
                    <div
                      key={`${tool.name}-${index}`}
                      className="rounded border px-3 py-2 text-xs"
                    >
                      <p className="font-medium">{tool.name}</p>
                      {tool.description && (
                        <p className="text-muted-foreground mt-0.5">
                          {tool.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  {settingsServer.connected
                    ? "No tools discovered"
                    : "Server is offline"}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                variant="ghost"
                onClick={() => setSettingsServer(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveSettings}
                disabled={settingsLoading}
              >
                {settingsLoading ? (
                  <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Check className="h-3 w-3 mr-1" />
                )}
                Save Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
