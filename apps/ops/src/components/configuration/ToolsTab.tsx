import { Plug, Webhook } from "lucide-react";
import { Separator } from "@modularmind/ui";
import { McpServersTab } from "./McpServersTab";
import { IntegrationsTab } from "./IntegrationsTab";

export function ToolsTab() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Plug className="h-5 w-5" />
          MCP Servers
        </h2>
        <McpServersTab />
      </section>

      <Separator />

      <section>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Webhook className="h-5 w-5" />
          Integrations
        </h2>
        <IntegrationsTab />
      </section>
    </div>
  );
}
