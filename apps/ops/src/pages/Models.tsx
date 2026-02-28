import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Plus, Cloud, Download, HardDrive, Settings, Square, Trash2 } from "lucide-react";
import { Button, PageHeader } from "@modularmind/ui";
import { PROVIDER_INFO } from "@modularmind/api-client";
import type { UnifiedCatalogModel, ModelProvider } from "@modularmind/api-client";
import { EmptyState } from "../components/shared/EmptyState";
import { ResourceTable } from "../components/shared/ResourceTable";
import { ResourceFilters } from "../components/shared/ResourceFilters";
import { ModelStatusBadge } from "../components/shared/ModelStatusBadge";
import { useModelsStore } from "../stores/models";
import type { ResourceColumn, ResourceFilterConfig, SortState } from "../lib/types";

const PAGE_SIZE = 20;

/**
 * Parse human-readable sizes ("8.2B", "4.0B", "137M", "4.9 GB", "262 MB")
 * into a comparable number. Returns 0 for null / unparseable values.
 */
function parseSizeToNumber(s: string | null): number {
  if (!s) return 0;
  const cleaned = s.trim().toUpperCase();
  const paramMatch = cleaned.match(/^([\d.]+)\s*(B|M|K)$/);
  if (paramMatch) {
    const n = parseFloat(paramMatch[1]);
    switch (paramMatch[2]) {
      case "B": return n * 1e9;
      case "M": return n * 1e6;
      case "K": return n * 1e3;
    }
  }
  const diskMatch = cleaned.match(/^([\d.]+)\s*(TB|GB|MB|KB)$/);
  if (diskMatch) {
    const n = parseFloat(diskMatch[1]);
    switch (diskMatch[2]) {
      case "TB": return n * 1e12;
      case "GB": return n * 1e9;
      case "MB": return n * 1e6;
      case "KB": return n * 1e3;
    }
  }
  return 0;
}

const STATUS_PRIORITY: Record<string, number> = {
  ready: 0,
  downloading: 1,
  not_pulled: 2,
  error: 3,
  no_credentials: 4,
};

/** Tag color mapping */
const TAG_COLORS: Record<string, string> = {
  chat: "bg-info/15 text-info",
  code: "bg-success/15 text-success",
  tools: "bg-primary/15 text-primary",
  vision: "bg-warning/15 text-warning",
  embedding: "bg-info/15 text-info",
};

/** Derive capability tags from model metadata */
function getModelTags(m: UnifiedCatalogModel): string[] {
  const tags: string[] = [];
  const name = m.model_name.toLowerCase();
  const isEmbedding =
    m.source === "catalog" &&
    "is_embedding" in m.data &&
    (m.data as Record<string, unknown>).is_embedding;

  if (isEmbedding) {
    tags.push("embedding");
    return tags;
  }

  // Chat / instruction-tuned models
  tags.push("chat");

  // Code capability
  if (
    name.includes("code") ||
    name.includes("coder") ||
    name.includes("starcoder") ||
    name.includes("deepseek-coder")
  ) {
    tags.push("code");
  }

  // Vision
  if (name.includes("vision") || name.includes("llava") || name.includes("bakllava")) {
    tags.push("vision");
  }

  // Tool use / function calling
  if (m.provider === "openai" || m.provider === "anthropic" || name.includes("qwen")) {
    tags.push("tools");
  }

  return tags;
}

const filterConfigs: ResourceFilterConfig[] = [
  { key: "search", label: "Search", type: "search", placeholder: "Search models..." },
  {
    key: "provider",
    label: "Provider",
    type: "select",
    placeholder: "All Providers",
    options: Object.entries(PROVIDER_INFO).map(([key, info]) => ({
      value: key,
      label: info.name,
    })),
  },
  {
    key: "type",
    label: "Type",
    type: "select",
    placeholder: "All Types",
    options: [
      { value: "local", label: "Local" },
      { value: "remote", label: "Cloud" },
    ],
  },
  {
    key: "status",
    label: "Status",
    type: "select",
    placeholder: "All Status",
    options: [
      { value: "ready", label: "Ready" },
      { value: "not_pulled", label: "Not Pulled" },
      { value: "downloading", label: "Downloading" },
      { value: "no_credentials", label: "No Credentials" },
    ],
  },
];

export default function Models() {
  const navigate = useNavigate();
  const {
    unifiedCatalog,
    loading,
    providerConfigs,
    fetchUnifiedCatalog,
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

  // Poll for downloading models
  useEffect(() => {
    const downloading = unifiedCatalog.filter(
      (m) => m.source === "catalog" && m.data.pull_status === "downloading",
    );
    if (downloading.length === 0) return;

    const interval = setInterval(() => {
      fetchUnifiedCatalog();
    }, 3000);
    return () => clearInterval(interval);
  }, [unifiedCatalog, fetchUnifiedCatalog]);

  // Client-side filtering + sorting
  const filtered = useMemo(() => {
    let result = unifiedCatalog;

    if (filterValues.search) {
      const s = filterValues.search.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(s) ||
          m.model_name.toLowerCase().includes(s),
      );
    }

    if (filterValues.provider) {
      result = result.filter((m) => m.provider === filterValues.provider);
    }

    if (filterValues.type) {
      result = result.filter((m) => m.model_type === filterValues.type);
    }

    if (filterValues.status) {
      switch (filterValues.status) {
        case "ready":
          result = result.filter((m) => m.unifiedStatus === "ready");
          break;
        case "not_pulled":
          result = result.filter((m) => m.unifiedStatus === "not_pulled");
          break;
        case "downloading":
          result = result.filter((m) => m.unifiedStatus === "downloading");
          break;
        case "no_credentials":
          result = result.filter((m) => m.unifiedStatus === "no_credentials");
          break;
      }
    }

    const hasColumnSort = !!filterValues.sort;

    result = [...result].sort((a, b) => {
      if (hasColumnSort) {
        switch (filterValues.sort) {
          case "name_asc":
            return a.name.localeCompare(b.name);
          case "name_desc":
            return b.name.localeCompare(a.name);
          case "provider_asc":
            return a.provider.localeCompare(b.provider);
          case "provider_desc":
            return b.provider.localeCompare(a.provider);
          case "size_asc":
            return parseSizeToNumber(a.size) - parseSizeToNumber(b.size);
          case "size_desc":
            return parseSizeToNumber(b.size) - parseSizeToNumber(a.size);
          case "disk_size_asc":
            return parseSizeToNumber(a.disk_size) - parseSizeToNumber(b.disk_size);
          case "disk_size_desc":
            return parseSizeToNumber(b.disk_size) - parseSizeToNumber(a.disk_size);
          case "context_asc":
            return (a.context_window || 0) - (b.context_window || 0);
          case "context_desc":
            return (b.context_window || 0) - (a.context_window || 0);
          case "status_asc":
            return (STATUS_PRIORITY[a.unifiedStatus] ?? 5) - (STATUS_PRIORITY[b.unifiedStatus] ?? 5);
          case "status_desc":
            return (STATUS_PRIORITY[b.unifiedStatus] ?? 5) - (STATUS_PRIORITY[a.unifiedStatus] ?? 5);
        }
        return 0;
      }

      // Default: ready first, then alphabetical
      const statusDiff =
        (STATUS_PRIORITY[a.unifiedStatus] ?? 5) - (STATUS_PRIORITY[b.unifiedStatus] ?? 5);
      if (statusDiff !== 0) return statusDiff;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [unifiedCatalog, filterValues]);

  // Client-side pagination
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
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

  const columns: ResourceColumn<UnifiedCatalogModel>[] = [
    {
      key: "name",
      header: "Model",
      sortKey: "name",
      render: (m) => {
        const tags = getModelTags(m);
        return (
          <div>
            <p className="font-medium text-sm">{m.name}</p>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className={`inline-flex items-center rounded-full text-[10px] px-1.5 py-0 h-4 font-medium ${TAG_COLORS[tag] || ""}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "provider",
      header: "Provider",
      sortKey: "provider",
      render: (m) => {
        const info = PROVIDER_INFO[m.provider];
        return (
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${info?.color || "bg-muted-foreground"}`} />
            <span className="text-sm">{info?.name || m.provider}</span>
          </div>
        );
      },
    },
    {
      key: "type",
      header: "Type",
      className: "hidden md:table-cell",
      render: (m) => (
        <div className="flex items-center gap-1.5 text-sm">
          {m.model_type === "local" ? (
            <>
              <HardDrive className="h-3.5 w-3.5 text-muted-foreground" /> Local
            </>
          ) : (
            <>
              <Cloud className="h-3.5 w-3.5 text-muted-foreground" /> Cloud
            </>
          )}
        </div>
      ),
    },
    {
      key: "size",
      header: "Params",
      sortKey: "size",
      className: "hidden md:table-cell",
      render: (m) => <span className="text-sm">{m.size || "\u2014"}</span>,
    },
    {
      key: "disk_size",
      header: "Disk",
      sortKey: "disk_size",
      className: "hidden md:table-cell",
      render: (m) => <span className="text-sm">{m.disk_size || "\u2014"}</span>,
    },
    {
      key: "context",
      header: "Context",
      sortKey: "context",
      className: "hidden lg:table-cell",
      render: (m) => (
        <span className="text-sm">
          {m.context_window ? `${Math.round(m.context_window / 1000)}k` : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortKey: "status",
      render: (m) => {
        const pullData =
          m.source === "catalog"
            ? {
                pull_status: m.data.pull_status,
                pull_progress: m.data.pull_progress,
                pull_error: m.data.pull_error,
              }
            : { pull_status: null, pull_progress: null, pull_error: null };
        return (
          <ModelStatusBadge
            model={{ ...pullData, provider: m.provider }}
            configured={isProviderConfigured(m.provider)}
          />
        );
      },
    },
  ];

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
          totalPages: Math.ceil(filtered.length / PAGE_SIZE),
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
          // Not pulled Ollama -> download button
          if (m.unifiedStatus === "not_pulled" && m.provider === "ollama") {
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
