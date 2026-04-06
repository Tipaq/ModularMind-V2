import { Cloud, HardDrive } from "lucide-react";
import { cn } from "@modularmind/ui";
import type { ResourceColumn, ResourceFilterConfig } from "@modularmind/ui";
import { PROVIDER_INFO } from "@modularmind/api-client";
import type { UnifiedCatalogModel, ModelProvider } from "@modularmind/api-client";
import { ModelStatusBadge } from "../../components/shared/ModelStatusBadge";
import { getModelTags, TAG_COLORS } from "./utils";

export const filterConfigs: ResourceFilterConfig[] = [
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

export function buildColumns(
  isProviderConfigured: (provider: ModelProvider) => boolean,
): ResourceColumn<UnifiedCatalogModel>[] {
  return [
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
                    className={cn("inline-flex items-center rounded-full text-[10px] px-1.5 py-0 h-4 font-medium", TAG_COLORS[tag])}
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
            <span className={cn("h-2 w-2 rounded-full", info?.color || "bg-muted-foreground")} />
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
          {m.context_window ? `${Math.round(m.context_window / 1000)}k` : "\u2014"}
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
}
