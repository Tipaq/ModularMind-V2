import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Plus, Download, Settings, Square, Trash2 } from "lucide-react";
import { Button, PageHeader, EmptyState, ResourceTable, ResourceFilters } from "@modularmind/ui";
import type { SortState } from "@modularmind/ui";
import type { UnifiedCatalogModel } from "@modularmind/api-client";
import { useModelsStore } from "../stores/models";
import { buildSizeCache, filterModels, sortModels } from "./models/utils";
import { filterConfigs, buildColumns } from "./models/columns";
import { DEFAULT_DEFAULT_PAGE_SIZE } from "../lib/constants";

export function Models() {
  const navigate = useNavigate();
  const {
    unifiedCatalog,
    loading,
    providerConfigs,
    fetchUnifiedCatalog,
    pollDownloadProgress,
    isProviderConfigured,
    triggerPull,
    cancelPull,
    removeFromCatalog,
  } = useModelsStore();

  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchUnifiedCatalog();
  }, [fetchUnifiedCatalog]);

  // Poll only download progress (lightweight — no full catalog refetch)
  useEffect(() => {
    const hasDownloading = unifiedCatalog.some(
      (m) => m.source === "catalog" && m.data.pull_status === "downloading",
    );
    if (!hasDownloading) return;

    const interval = setInterval(() => {
      pollDownloadProgress();
    }, 3000);
    return () => clearInterval(interval);
  }, [unifiedCatalog, pollDownloadProgress]);

  const sizeCache = useMemo(() => buildSizeCache(unifiedCatalog), [unifiedCatalog]);

  const filtered = useMemo(() => {
    const result = filterModels(unifiedCatalog, filterValues);
    return sortModels(result, filterValues.sort || undefined, sizeCache);
  }, [unifiedCatalog, filterValues, sizeCache]);

  // Client-side pagination
  const paginated = useMemo(() => {
    const start = (page - 1) * DEFAULT_PAGE_SIZE;
    return filtered.slice(start, start + DEFAULT_PAGE_SIZE);
  }, [filtered, page]);

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const sortState = useMemo((): SortState | null => {
    const s = filterValues.sort;
    if (!s) return null;
    if (s.endsWith("_asc")) return { key: s.replace(/_asc$/, ""), direction: "asc" };
    if (s.endsWith("_desc")) return { key: s.replace(/_desc$/, ""), direction: "desc" };
    return { key: s, direction: "asc" };
  }, [filterValues.sort]);

  const handleColumnSort = useCallback((sortKey: string) => {
    setFilterValues((prev) => {
      const current = prev.sort || "";
      if (current === `${sortKey}_asc` || current === sortKey) {
        return { ...prev, sort: `${sortKey}_desc` };
      }
      if (current === `${sortKey}_desc`) {
        return { ...prev, sort: "" };
      }
      return { ...prev, sort: `${sortKey}_asc` };
    });
    setPage(1);
  }, []);

  const handleRowClick = useCallback(
    (model: UnifiedCatalogModel) => {
      if (model.source === "catalog") {
        navigate(`/models/${model.id}`);
      }
    },
    [navigate],
  );

  const columns = useMemo(
    () => buildColumns(isProviderConfigured),
    [isProviderConfigured],
  );

  const hasProviders = providerConfigs.some((p) => p.is_connected);

  const emptyState = !hasProviders ? (
    <EmptyState
      icon={Settings}
      title="No model providers configured"
      description="Connect Ollama or add cloud provider API keys to get started."
      action={
        <Button onClick={() => navigate("/configuration?tab=providers")}>
          Configure Providers
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={Box}
      title="No models installed yet"
      description="Browse available models and pull your first one."
      action={
        <Button onClick={() => fetchUnifiedCatalog()}>
          <Plus className="h-4 w-4 mr-2" /> Add Model
        </Button>
      }
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Box}
        gradient="from-info to-info/70"
        title="Models"
        description="Manage AI models across all providers"
      />

      <ResourceFilters
        filters={filterConfigs}
        values={filterValues}
        onChange={handleFilterChange}
      />

      <ResourceTable<UnifiedCatalogModel>
        items={paginated}
        columns={columns}
        pagination={{
          page,
          totalPages: Math.ceil(filtered.length / DEFAULT_PAGE_SIZE),
          totalItems: filtered.length,
        }}
        onPageChange={setPage}
        onRowClick={handleRowClick}
        isLoading={loading}
        emptyState={emptyState}
        keyExtractor={(m) => m.id}
        sortState={sortState}
        onSort={handleColumnSort}
        rowActions={(m) => {
          // Downloading Ollama -> stop button
          if (m.unifiedStatus === "downloading" && m.provider === "ollama") {
            return (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                title="Stop download"
                onClick={() => cancelPull(m.model_name)}
              >
                <Square className="h-4 w-4" />
              </Button>
            );
          }
          // Error or not pulled Ollama -> download/retry button
          if ((m.unifiedStatus === "not_pulled" || m.unifiedStatus === "error") && m.provider === "ollama") {
            return (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-info"
                title="Pull model"
                onClick={() =>
                  triggerPull({
                    model_name: m.model_name,
                    display_name: m.name,
                    parameter_size: m.size || undefined,
                    disk_size: m.disk_size || undefined,
                    context_window: m.context_window || undefined,
                  })
                }
              >
                <Download className="h-4 w-4" />
              </Button>
            );
          }
          // No credentials -> settings gear
          if (m.unifiedStatus === "no_credentials") {
            return (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                title="Configure provider"
                onClick={() => navigate("/configuration?tab=providers")}
              >
                <Settings className="h-4 w-4" />
              </Button>
            );
          }
          // Ready catalog model -> delete
          if (m.source === "catalog") {
            return (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                title="Remove from catalog"
                onClick={() => removeFromCatalog(m.data.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            );
          }
          return null;
        }}
      />
    </div>
  );
}
