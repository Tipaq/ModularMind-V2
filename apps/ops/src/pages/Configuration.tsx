import { Settings2, RefreshCw, Key, Check, X } from "lucide-react";
import { cn } from "@modularmind/ui";
import type { ProviderConfig } from "@modularmind/api-client";
import { getProviderInfo } from "@modularmind/api-client";
import { PageHeader } from "../components/shared/PageHeader";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";

export default function Configuration() {
  const { data: providers, isLoading, refetch } = useApi<ProviderConfig[]>(
    () => api.get("/models/providers"),
    [],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Settings2}
        gradient="from-gray-500 to-zinc-600"
        title="Configuration"
        description="LLM providers, API keys, and system settings"
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

      {/* LLM Providers */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">LLM Providers</h2>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/50" />
            ))}
          </div>
        ) : !providers || providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No providers configured</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {providers.map((p) => {
              const info = getProviderInfo(p.provider);
              return (
                <div
                  key={p.provider}
                  className="rounded-xl border border-border/50 bg-card/50 p-5 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={cn("h-3 w-3 rounded-full", info.color)} />
                      <h3 className="font-medium">{p.name}</h3>
                    </div>
                    {p.is_connected ? (
                      <span className="flex items-center gap-1 text-xs text-green-500">
                        <Check className="h-3 w-3" /> Connected
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-red-500">
                        <X className="h-3 w-3" /> Disconnected
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Key className="h-3 w-3" />
                    {p.is_configured ? "API key configured" : "No API key"}
                  </div>
                  {p.base_url && (
                    <p className="mt-1 text-xs text-muted-foreground font-mono truncate">
                      {p.base_url}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
