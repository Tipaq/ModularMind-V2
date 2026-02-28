import { Layers, RefreshCw, Download, Check, AlertCircle } from "lucide-react";
import { cn } from "@modularmind/ui";
import type { CatalogModel, PaginatedCatalog } from "@modularmind/api-client";
import { getProviderInfo } from "@modularmind/api-client";
import { PageHeader } from "../components/shared/PageHeader";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";

function PullStatusBadge({ model }: { model: CatalogModel }) {
  if (model.pull_status === "ready") {
    return (
      <span className="flex items-center gap-1 rounded-md bg-green-500/10 px-2 py-0.5 text-xs text-green-500">
        <Check className="h-3 w-3" /> Ready
      </span>
    );
  }
  if (model.pull_status === "downloading") {
    return (
      <span className="flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-xs text-blue-500">
        <Download className="h-3 w-3 animate-bounce" /> {model.pull_progress ?? 0}%
      </span>
    );
  }
  if (model.pull_status === "error") {
    return (
      <span className="flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-xs text-red-500">
        <AlertCircle className="h-3 w-3" /> Error
      </span>
    );
  }
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {model.model_type === "local" ? "Not pulled" : "Remote"}
    </span>
  );
}

export default function Models() {
  const { data, isLoading, refetch } = useApi<PaginatedCatalog>(
    () => api.get("/models/catalog"),
    [],
  );

  const models = data?.models ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Layers}
        gradient="from-emerald-500 to-green-500"
        title="Models"
        description="Model catalog and provider status"
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
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      ) : models.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-card/50 p-12 text-center">
          <Layers className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-muted-foreground">No models in catalog</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => {
            const provider = getProviderInfo(model.provider);
            return (
              <div
                key={model.id}
                className="rounded-xl border border-border/50 bg-card/50 p-5 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{model.display_name}</h3>
                    <p className="text-xs text-muted-foreground font-mono">{model.model_name}</p>
                  </div>
                  <PullStatusBadge model={model} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <span className={cn("h-2 w-2 rounded-full", provider.color)} />
                    {provider.name}
                  </div>
                  {model.size && <span>{model.size}</span>}
                  {model.context_window && <span>{(model.context_window / 1000).toFixed(0)}k ctx</span>}
                  {model.disk_size && <span>{model.disk_size}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
