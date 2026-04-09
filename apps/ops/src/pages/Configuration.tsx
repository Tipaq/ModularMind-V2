import { useSearchParams } from "react-router-dom";
import { Settings2, Key, Plug, Shield, BookOpen, Cog } from "lucide-react";
import { PageHeader, Tabs, TabsList, TabsTrigger, TabsContent } from "@modularmind/ui";
import { ProvidersTab } from "../components/configuration/ProvidersTab";
import { ToolsTab } from "../components/configuration/ToolsTab";
import { ConnectionsTab } from "../components/configuration/ConnectionsTab";
import { KnowledgeConfigTab } from "../components/configuration/KnowledgeConfigTab";
import { SystemSettingsTab } from "../components/configuration/SystemSettingsTab";

type TabId = "providers" | "tools" | "connections" | "knowledge" | "system";

const TAB_ALIASES: Record<string, TabId> = {
  mcp: "tools",
  integrations: "tools",
  oauth: "connections",
  github: "connections",
  filesystem: "system",
  infra: "system",
};

function resolveTab(raw: string | null): TabId {
  if (!raw) return "providers";
  if (TAB_ALIASES[raw]) return TAB_ALIASES[raw];
  return (raw as TabId) || "providers";
}

export function Configuration() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveTab(searchParams.get("tab"));

  const setActiveTab = (tab: TabId) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings2}
        gradient="from-primary to-primary/70"
        title="Configuration"
        description="Manage providers, tools, connections, and system settings"
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
        <TabsList>
          <TabsTrigger value="providers">
            <Key className="h-4 w-4" />
            Providers
          </TabsTrigger>
          <TabsTrigger value="tools">
            <Plug className="h-4 w-4" />
            Tools
          </TabsTrigger>
          <TabsTrigger value="connections">
            <Shield className="h-4 w-4" />
            Connections
          </TabsTrigger>
          <TabsTrigger value="knowledge">
            <BookOpen className="h-4 w-4" />
            Knowledge
          </TabsTrigger>
          <TabsTrigger value="system">
            <Cog className="h-4 w-4" />
            System
          </TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="mt-6">
          <ProvidersTab />
        </TabsContent>
        <TabsContent value="tools" className="mt-6">
          <ToolsTab />
        </TabsContent>
        <TabsContent value="connections" className="mt-6">
          <ConnectionsTab />
        </TabsContent>
        <TabsContent value="knowledge" className="mt-6">
          <KnowledgeConfigTab />
        </TabsContent>
        <TabsContent value="system" className="mt-6">
          <SystemSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
