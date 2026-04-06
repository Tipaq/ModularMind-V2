import type { UnifiedCatalogModel } from "@modularmind/api-client";

export function parseSizeToNumber(s: string | null): number {
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

export const STATUS_PRIORITY: Record<string, number> = {
  ready: 0,
  downloading: 1,
  not_pulled: 2,
  error: 3,
  no_credentials: 4,
};

export const TAG_COLORS: Record<string, string> = {
  chat: "bg-info/15 text-info",
  code: "bg-success/15 text-success",
  tools: "bg-primary/15 text-primary",
  vision: "bg-warning/15 text-warning",
  embedding: "bg-info/15 text-info",
};

const CODE_MODEL_PATTERNS = ["code", "coder", "starcoder", "deepseek-coder"];
const VISION_MODEL_PATTERNS = ["vision", "llava", "bakllava"];
const TOOL_USE_PROVIDERS = ["openai", "anthropic"];

export function getModelTags(m: UnifiedCatalogModel): string[] {
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

  tags.push("chat");

  if (CODE_MODEL_PATTERNS.some((p) => name.includes(p))) {
    tags.push("code");
  }

  if (VISION_MODEL_PATTERNS.some((p) => name.includes(p))) {
    tags.push("vision");
  }

  if (TOOL_USE_PROVIDERS.includes(m.provider) || name.includes("qwen")) {
    tags.push("tools");
  }

  return tags;
}

export interface SizeCache {
  param: Map<string, number>;
  disk: Map<string, number>;
}

export function buildSizeCache(catalog: UnifiedCatalogModel[]): SizeCache {
  const param = new Map<string, number>();
  const disk = new Map<string, number>();
  for (const m of catalog) {
    param.set(m.id, parseSizeToNumber(m.size));
    disk.set(m.id, parseSizeToNumber(m.disk_size));
  }
  return { param, disk };
}

export function filterModels(
  catalog: UnifiedCatalogModel[],
  filterValues: Record<string, string>,
): UnifiedCatalogModel[] {
  let result = catalog;

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
    result = result.filter((m) => m.unifiedStatus === filterValues.status);
  }

  return result;
}

export function sortModels(
  models: UnifiedCatalogModel[],
  sortKey: string | undefined,
  sizeCache: SizeCache,
): UnifiedCatalogModel[] {
  const result = [...models];

  if (sortKey) {
    return result.sort((a, b) => {
      switch (sortKey) {
        case "name_asc": return a.name.localeCompare(b.name);
        case "name_desc": return b.name.localeCompare(a.name);
        case "provider_asc": return a.provider.localeCompare(b.provider);
        case "provider_desc": return b.provider.localeCompare(a.provider);
        case "size_asc": return (sizeCache.param.get(a.id) ?? 0) - (sizeCache.param.get(b.id) ?? 0);
        case "size_desc": return (sizeCache.param.get(b.id) ?? 0) - (sizeCache.param.get(a.id) ?? 0);
        case "disk_size_asc": return (sizeCache.disk.get(a.id) ?? 0) - (sizeCache.disk.get(b.id) ?? 0);
        case "disk_size_desc": return (sizeCache.disk.get(b.id) ?? 0) - (sizeCache.disk.get(a.id) ?? 0);
        case "context_asc": return (a.context_window || 0) - (b.context_window || 0);
        case "context_desc": return (b.context_window || 0) - (a.context_window || 0);
        case "status_asc": return (STATUS_PRIORITY[a.unifiedStatus] ?? 5) - (STATUS_PRIORITY[b.unifiedStatus] ?? 5);
        case "status_desc": return (STATUS_PRIORITY[b.unifiedStatus] ?? 5) - (STATUS_PRIORITY[a.unifiedStatus] ?? 5);
        default: return 0;
      }
    });
  }

  return result.sort((a, b) => {
    const statusDiff =
      (STATUS_PRIORITY[a.unifiedStatus] ?? 5) - (STATUS_PRIORITY[b.unifiedStatus] ?? 5);
    if (statusDiff !== 0) return statusDiff;
    return a.name.localeCompare(b.name);
  });
}
