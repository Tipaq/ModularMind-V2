import { Bot, RefreshCw } from "lucide-react";
import { cn, stripProvider } from "@modularmind/ui";
import type { Agent } from "@modularmind/api-client";
import { getProviderInfo } from "@modularmind/api-client";
import { PageHeader } from "../components/shared/PageHeader";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";

export default function Agents() {
  const { data, isLoading, refetch } = useApi<{ items: Agent[] }>(
    () => api.get("/agents"),
    [],
  );

  const agents = data?.items ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Bot}
        gradient="from-violet-500 to-purple-500"
        title="Agents"
        description="View and manage deployed agents"
        actions={
          <button
            onClick={refetch}
            className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm hover:bg-muted/80 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-card/50 p-12 text-center">
          <Bot className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-muted-foreground">No agents deployed yet</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const provider = getProviderInfo(agent.model_id.split("/")[0] ?? "");
            return (
              <div
                key={agent.id}
                className="rounded-xl border border-border/50 bg-card/50 p-5 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-500">
                      <Bot className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-medium">{agent.name}</h3>
                      <p className="text-xs text-muted-foreground">v{agent.version}</p>
                    </div>
                  </div>
                  {agent.is_template && (
                    <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-xs text-blue-500">Template</span>
                  )}
                </div>
                {agent.description && (
                  <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{agent.description}</p>
                )}
                <div className="mt-4 flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", provider.color)} />
                  <span className="text-xs text-muted-foreground">
                    {provider.name} / {stripProvider(agent.model_id)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
