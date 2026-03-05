import { useEffect, useState } from "react";
import {
  Hash,
  MessageSquare,
  Mail,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  Power,
  PowerOff,
} from "lucide-react";
import {
  Card,
  CardContent,
  Button,
  Badge,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@modularmind/ui";
import type { ConnectorData, Agent } from "@modularmind/api-client";
import { api } from "../../lib/api";

// ─── Discord icon (lucide doesn't include it) ──────────────────────────────

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
    </svg>
  );
}

// ─── Field / connector definitions ──────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "password";
  required: boolean;
}

interface ConnectorTypeDef {
  type: "discord" | "slack" | "teams" | "email";
  name: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  description: string;
  docUrl: string;
  setupSteps: string[];
  fields: FieldDef[];
}

const CONNECTOR_TYPES: ConnectorTypeDef[] = [
  {
    type: "discord",
    name: "Discord",
    icon: DiscordIcon,
    color: "bg-accent",
    description: "Connect your bot to a Discord server via slash commands",
    docUrl: "https://discord.com/developers/docs/getting-started",
    setupSteps: [
      "Create an application at discord.com/developers/applications",
      'Under "Bot", click Reset Token and copy the Bot Token',
      'Under "General Information", copy Application ID and Public Key',
      'Under "OAuth2 > URL Generator", select bot + applications.commands scopes, then invite to your server',
      "Fill in the credentials below and click Connect",
      'Copy the Webhook URL below and paste it in "Interactions Endpoint URL" in your Discord app settings',
    ],
    fields: [
      {
        key: "bot_token",
        label: "Bot Token",
        placeholder: "MTI3...",
        type: "password",
        required: true,
      },
      {
        key: "application_id",
        label: "Application ID",
        placeholder: "1234567890",
        type: "text",
        required: true,
      },
      {
        key: "public_key",
        label: "Public Key",
        placeholder: "abc123def456...",
        type: "text",
        required: true,
      },
      {
        key: "guild_id",
        label: "Guild (Server) ID",
        placeholder: "9876543210 (optional)",
        type: "text",
        required: false,
      },
    ],
  },
  {
    type: "slack",
    name: "Slack",
    icon: Hash,
    color: "bg-secondary",
    description: "Receive messages from Slack channels via Events API",
    docUrl: "https://api.slack.com/start/building",
    setupSteps: [
      "Create a Slack app at api.slack.com/apps",
      "Under OAuth & Permissions, add chat:write and channels:history scopes",
      "Install the app to your workspace and copy the Bot Token",
      'Under "Basic Information", copy the Signing Secret',
      "Fill in the credentials below and click Connect",
      'Copy the Webhook URL and add it as "Event Subscriptions" Request URL',
    ],
    fields: [
      {
        key: "bot_token",
        label: "Bot Token",
        placeholder: "xoxb-...",
        type: "password",
        required: true,
      },
      {
        key: "signing_secret",
        label: "Signing Secret",
        placeholder: "abc123...",
        type: "password",
        required: true,
      },
      {
        key: "channel",
        label: "Channel ID",
        placeholder: "C01ABCDEF (optional)",
        type: "text",
        required: false,
      },
    ],
  },
  {
    type: "teams",
    name: "Microsoft Teams",
    icon: MessageSquare,
    color: "bg-info",
    description: "Receive messages from Teams via Bot Framework",
    docUrl: "https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/create-a-bot-for-teams",
    setupSteps: [
      "Register a Bot Channel in Azure Portal (Bot Framework)",
      "Note down the App ID and App Secret from Azure AD",
      "Copy the Tenant ID from Azure AD",
      "Fill in the credentials below and click Connect",
      "Copy the Webhook URL and set it as the Messaging Endpoint in Azure",
    ],
    fields: [
      {
        key: "app_id",
        label: "App ID",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        type: "text",
        required: true,
      },
      {
        key: "app_secret",
        label: "App Secret",
        placeholder: "...",
        type: "password",
        required: true,
      },
      {
        key: "tenant_id",
        label: "Tenant ID",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        type: "text",
        required: true,
      },
    ],
  },
  {
    type: "email",
    name: "Email",
    icon: Mail,
    color: "bg-success",
    description: "Receive emails via SMTP/IMAP webhook forwarding",
    docUrl: "https://support.google.com/mail/answer/7126229",
    setupSteps: [
      "Set up an email account with SMTP access",
      "Note the SMTP host and port (e.g., smtp.gmail.com:587)",
      "Fill in the credentials below and click Connect",
    ],
    fields: [
      {
        key: "address",
        label: "Email Address",
        placeholder: "bot@example.com",
        type: "text",
        required: true,
      },
      {
        key: "smtp_host",
        label: "SMTP Host",
        placeholder: "smtp.gmail.com",
        type: "text",
        required: true,
      },
      {
        key: "smtp_port",
        label: "SMTP Port",
        placeholder: "587",
        type: "text",
        required: false,
      },
    ],
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function IntegrationsTab() {
  const [connectors, setConnectors] = useState<ConnectorData[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());

  // Form state per connector type
  const [formData, setFormData] = useState<
    Record<string, Record<string, string>>
  >({});
  const [selectedAgentId, setSelectedAgentId] = useState<
    Record<string, string>
  >({});
  const [connectorName, setConnectorName] = useState<Record<string, string>>(
    {},
  );
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [connRes, agentRes] = await Promise.all([
          api.get<{ items: ConnectorData[] }>("/connectors"),
          api.get<{ items: Agent[] }>("/agents"),
        ]);
        setConnectors(connRes.items);
        setAgents(agentRes.items);
      } catch (err) {
        console.warn("[IntegrationsTab] endpoints not available:", err);
      }
      setLoading(false);
    })();
  }, []);

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleSecret = (fieldKey: string) => {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(fieldKey)) next.delete(fieldKey);
      else next.add(fieldKey);
      return next;
    });
  };

  const updateField = (type: string, key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [type]: { ...prev[type], [key]: value },
    }));
  };

  const handleConnect = async (typeDef: ConnectorTypeDef) => {
    const fields = formData[typeDef.type] || {};
    const agentId = selectedAgentId[typeDef.type];
    const name =
      connectorName[typeDef.type] || `${typeDef.name} Connector`;

    for (const f of typeDef.fields) {
      if (f.required && !fields[f.key]?.trim()) {
        alert(`Please fill in: ${f.label}`);
        return;
      }
    }
    if (!agentId) {
      alert("Please select an agent");
      return;
    }

    setCreating(typeDef.type);
    try {
      const data = await api.post<ConnectorData>("/connectors", {
        name,
        connector_type: typeDef.type,
        agent_id: agentId,
        config: fields,
      });
      setConnectors((prev) => [data, ...prev]);
      setFormData((prev) => ({ ...prev, [typeDef.type]: {} }));
      setConnectorName((prev) => ({ ...prev, [typeDef.type]: "" }));
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setCreating(null);
  };

  const handleToggle = async (connector: ConnectorData) => {
    try {
      const data = await api.put<ConnectorData>(
        `/connectors/${connector.id}`,
        { is_enabled: !connector.is_enabled },
      );
      setConnectors((prev) =>
        prev.map((c) => (c.id === connector.id ? data : c)),
      );
    } catch (err) {
      console.error("[Integrations] toggle:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to disconnect this connector?")) return;
    try {
      await api.delete(`/connectors/${id}`);
      setConnectors((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("[Integrations] delete:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const getTypeConnectors = (type: string) =>
    connectors.filter((c) => c.connector_type === type);

  const getWebhookUrl = (connector: ConnectorData) => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/api/v1/webhooks/${connector.id}`;
  };

  return (
    <div className="space-y-4">
      {CONNECTOR_TYPES.map((typeDef) => {
        const {
          type,
          name,
          icon: Icon,
          color,
          description,
          docUrl,
          setupSteps,
          fields,
        } = typeDef;
        const isExpanded = expandedType === type;
        const typeConnectors = getTypeConnectors(type);
        const hasConnectors = typeConnectors.length > 0;

        return (
          <Card key={type} className="overflow-hidden">
            {/* Card header */}
            <button
              className="w-full text-left"
              onClick={() => setExpandedType(isExpanded ? null : type)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}
                    >
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{name}</p>
                        {hasConnectors ? (
                          <Badge variant="success">
                            {typeConnectors.length} connected
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Not configured</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardContent>
            </button>

            {/* Expanded panel */}
            {isExpanded && (
              <div className="border-t px-4 pb-4">
                {/* Existing connectors */}
                {typeConnectors.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Active connections
                    </p>
                    {typeConnectors.map((connector) => {
                      const webhookUrl = getWebhookUrl(connector);
                      return (
                        <div
                          key={connector.id}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm truncate">
                                {connector.name}
                              </p>
                              <Badge
                                variant={
                                  connector.is_enabled
                                    ? "success"
                                    : "secondary"
                                }
                                className="text-[10px]"
                              >
                                {connector.is_enabled ? "Active" : "Disabled"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              Agent:{" "}
                              {agents.find((a) => a.id === connector.agent_id)
                                ?.name || connector.agent_id.slice(0, 8)}
                            </p>
                            <div className="flex items-center gap-1 mt-1">
                              <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-[400px]">
                                {webhookUrl}
                              </code>
                              <button
                                className="text-muted-foreground hover:text-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(
                                    webhookUrl,
                                    `wh-${connector.id}`,
                                  );
                                }}
                              >
                                {copiedId === `wh-${connector.id}` ? (
                                  <Check className="h-3 w-3 text-success" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 ml-3 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggle(connector);
                              }}
                              title={
                                connector.is_enabled ? "Disable" : "Enable"
                              }
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
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(connector.id);
                              }}
                              title="Disconnect"
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Setup / New connection form */}
                <div className="mt-4 rounded-lg border border-dashed p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {hasConnectors
                        ? "Add another connection"
                        : "Setup guide"}
                    </p>
                    <a
                      href={docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Documentation
                    </a>
                  </div>

                  <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                    {setupSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>

                  {/* Credential fields */}
                  <div className="grid grid-cols-2 gap-3">
                    {fields.map((field) => {
                      const secretKey = `${type}-${field.key}`;
                      const isPassword = field.type === "password";
                      const isVisible = visibleSecrets.has(secretKey);

                      return (
                        <div key={field.key} className="space-y-1">
                          <Label className="text-xs">
                            {field.label}
                            {field.required && (
                              <span className="text-destructive ml-0.5">
                                *
                              </span>
                            )}
                          </Label>
                          <div className="relative">
                            <Input
                              type={
                                isPassword && !isVisible ? "password" : "text"
                              }
                              placeholder={field.placeholder}
                              value={formData[type]?.[field.key] || ""}
                              onChange={(e) =>
                                updateField(type, field.key, e.target.value)
                              }
                              className="text-xs h-8 pr-8"
                            />
                            {isPassword && (
                              <button
                                type="button"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                onClick={() => toggleSecret(secretKey)}
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

                  {/* Name + Agent selector + Connect */}
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Connector Name</Label>
                      <Input
                        placeholder={`My ${name} Bot`}
                        value={connectorName[type] || ""}
                        onChange={(e) =>
                          setConnectorName((prev) => ({
                            ...prev,
                            [type]: e.target.value,
                          }))
                        }
                        className="text-xs h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">
                        Agent <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={selectedAgentId[type] || ""}
                        onValueChange={(value) =>
                          setSelectedAgentId((prev) => ({
                            ...prev,
                            [type]: value,
                          }))
                        }
                      >
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue placeholder="Select an agent..." />
                        </SelectTrigger>
                        <SelectContent>
                          {agents.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={() => handleConnect(typeDef)}
                      disabled={creating === type}
                      className="h-8 text-xs"
                    >
                      {creating === type ? (
                        <>
                          <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                          Connecting...
                        </>
                      ) : (
                        "Connect"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
