import { useSearchParams } from "react-router-dom";
import { Settings2, Key, Plug, Webhook, Cog } from "lucide-react";
import { PageHeader } from "@modularmind/ui";
import ProvidersTab from "../components/configuration/ProvidersTab";
import McpServersTab from "../components/configuration/McpServersTab";
import IntegrationsTab from "../components/configuration/IntegrationsTab";
import SystemTab from "../components/configuration/SystemTab";

type TabId = "providers" | "mcp" | "integrations" | "system";

const tabs: { id: TabId; label: string; icon: typeof Key }[] = [
  { id: "providers", label: "Providers", icon: Key },
  { id: "mcp", label: "MCP Servers", icon: Plug },
  { id: "integrations", label: "Integrations", icon: Webhook },
  { id: "system", label: "System", icon: Cog },
];

export default function Configuration() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabId) || "providers";

  const setActiveTab = (tab: TabId) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings2}
        gradient="from-primary to-primary/70"
        title="Configuration"
        description="Manage providers, integrations, and system settings"
      />

      <div className="flex border-b border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "providers" && <ProvidersTab />}
      {activeTab === "mcp" && <McpServersTab />}
      {activeTab === "integrations" && <IntegrationsTab />}
      {activeTab === "system" && <SystemTab />}
    </div>
  );
}
