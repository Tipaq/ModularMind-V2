import { useSearchParams } from "react-router-dom";
import { Settings2, Key, Plug, Webhook, BookOpen, Cog, Github, FolderLock, Server, Shield } from "lucide-react";
import { PageHeader, Tabs, TabsList, TabsTrigger, TabsContent } from "@modularmind/ui";
import { ProvidersTab } from "../components/configuration/ProvidersTab";
import { McpServersTab } from "../components/configuration/McpServersTab";
import { IntegrationsTab } from "../components/configuration/IntegrationsTab";
import { OAuthProvidersTab } from "../components/configuration/OAuthProvidersTab";
import { KnowledgeConfigTab } from "../components/configuration/KnowledgeConfigTab";
import { SystemTab } from "../components/configuration/SystemTab";
import { GitHubTokensTab } from "../components/configuration/GitHubTokensTab";
import { FilesystemSecurityTab } from "../components/configuration/FilesystemSecurityTab";
import { InfrastructureTab } from "../components/configuration/InfrastructureTab";

type TabId = "providers" | "mcp" | "integrations" | "oauth" | "knowledge" | "system" | "github" | "filesystem" | "infra";

export function Configuration() {
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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
        <TabsList>
          <TabsTrigger value="providers">
            <Key className="h-4 w-4" />
            Providers
          </TabsTrigger>
          <TabsTrigger value="mcp">
            <Plug className="h-4 w-4" />
            MCP Servers
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Webhook className="h-4 w-4" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="oauth">
            <Shield className="h-4 w-4" />
            OAuth
          </TabsTrigger>
          <TabsTrigger value="knowledge">
            <BookOpen className="h-4 w-4" />
            Knowledge
          </TabsTrigger>
          <TabsTrigger value="github">
            <Github className="h-4 w-4" />
            GitHub
          </TabsTrigger>
          <TabsTrigger value="filesystem">
            <FolderLock className="h-4 w-4" />
            Filesystem
          </TabsTrigger>
          <TabsTrigger value="infra">
            <Server className="h-4 w-4" />
            Infrastructure
          </TabsTrigger>
          <TabsTrigger value="system">
            <Cog className="h-4 w-4" />
            System
          </TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="mt-6">
          <ProvidersTab />
        </TabsContent>
        <TabsContent value="mcp" className="mt-6">
          <McpServersTab />
        </TabsContent>
        <TabsContent value="integrations" className="mt-6">
          <IntegrationsTab />
        </TabsContent>
        <TabsContent value="oauth" className="mt-6">
          <OAuthProvidersTab />
        </TabsContent>
        <TabsContent value="knowledge" className="mt-6">
          <KnowledgeConfigTab />
        </TabsContent>
        <TabsContent value="github" className="mt-6">
          <GitHubTokensTab />
        </TabsContent>
        <TabsContent value="filesystem" className="mt-6">
          <FilesystemSecurityTab />
        </TabsContent>
        <TabsContent value="infra" className="mt-6">
          <InfrastructureTab />
        </TabsContent>
        <TabsContent value="system" className="mt-6">
          <SystemTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
