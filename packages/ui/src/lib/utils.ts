import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

/** Alias for formatNumber — formats token counts with K/M suffixes. */
export const formatTokens = formatNumber;

function asUtc(dateString: string): string {
  if (dateString.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(dateString)) return dateString;
  return `${dateString}Z`;
}

function formatDate(dateString: string): string {
  return new Date(asUtc(dateString)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeTime(dateString: string): string {
  const date = new Date(asUtc(dateString));
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

const LLM_PROVIDERS = ['ollama', 'openai', 'anthropic', 'google', 'mistral', 'cohere', 'groq'] as const;

export function stripProvider(modelId: string): string {
  for (const p of LLM_PROVIDERS) {
    if (modelId.startsWith(`${p}:`)) return modelId.slice(p.length + 1);
  }
  return modelId;
}

export function isLocalModel(modelId: string): boolean {
  return modelId.startsWith('ollama:');
}

/**
 * Format a raw model ID into a clean display name.
 * e.g. "ollama:qwen3:8b" → "Qwen3 8B"
 *      "openai:gpt-4o" → "GPT-4o"
 *      "anthropic:claude-sonnet-4-20250514" → "Claude Sonnet 4"
 */
export function formatModelName(modelId: string): string {
  // Strip provider prefix
  let name = stripProvider(modelId);

  // Split size tag (e.g. "qwen3:8b" → name="qwen3", tag="8b")
  const colonIdx = name.indexOf(':');
  let tag = '';
  if (colonIdx !== -1) {
    tag = name.slice(colonIdx + 1);
    name = name.slice(0, colonIdx);
  }

  // Remove date suffixes like -20250514
  name = name.replace(/-\d{8}$/, '');

  // Remove trailing version-like suffixes (e.g. -v2, -v1.5) but keep them for short names
  const versionMatch = name.match(/-v(\d+(?:\.\d+)?)$/);
  let version = '';
  if (versionMatch) {
    version = ` v${versionMatch[1]}`;
    name = name.slice(0, -versionMatch[0].length);
  }

  // Capitalize segments separated by hyphens
  name = name
    .split('-')
    .map((seg) => {
      // Keep known uppercase patterns
      if (/^gpt$/i.test(seg)) return 'GPT';
      if (/^llama$/i.test(seg)) return 'Llama';
      if (/^claude$/i.test(seg)) return 'Claude';
      if (/^gemma$/i.test(seg)) return 'Gemma';
      if (/^gemini$/i.test(seg)) return 'Gemini';
      if (/^phi$/i.test(seg)) return 'Phi';
      if (/^command$/i.test(seg)) return 'Command';
      if (/^mistral$/i.test(seg)) return 'Mistral';
      if (/^mixtral$/i.test(seg)) return 'Mixtral';
      if (/^deepseek$/i.test(seg)) return 'DeepSeek';
      if (/^qwen\d*/i.test(seg)) return seg.charAt(0).toUpperCase() + seg.slice(1);
      if (/^o\d+$/i.test(seg)) return seg; // o1, o3, etc.
      // Capitalize first letter
      return seg.charAt(0).toUpperCase() + seg.slice(1);
    })
    .join(' ');

  // Append tag (size) in uppercase
  if (tag) name += ` ${tag.toUpperCase()}`;
  if (version) name += version;

  return name;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatCost(cost: number | null): string {
  if (cost === null || cost === undefined) return "--";
  if (cost < 0.01) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}

/** Toggle an item in an array: remove if present, append if absent. */
export function toggleArrayItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];
}
