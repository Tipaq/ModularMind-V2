/**
 * Shared color constants for semantic statuses, channels, and activity types.
 * All values use theme tokens so they work in both light and dark mode.
 */

/** Release channel badge classes */
export const CHANNEL_COLORS: Record<string, string> = {
  dev: "bg-warning/15 text-warning",
  beta: "bg-info/15 text-info",
  stable: "bg-success/15 text-success",
};

/** Engine / service status badge classes */
export const STATUS_COLORS: Record<string, string> = {
  synced: "bg-success/15 text-success",
  registered: "bg-info/15 text-info",
  offline: "bg-muted text-muted-foreground",
  running: "bg-success/15 text-success",
  stopped: "bg-destructive/15 text-destructive",
  error: "bg-destructive/15 text-destructive",
  pending: "bg-warning/15 text-warning",
};

/** User role badge classes */
export const ROLE_COLORS: Record<string, string> = {
  owner: "bg-warning/15 text-warning",
  admin: "bg-info/15 text-info",
  member: "bg-muted text-muted-foreground",
  viewer: "bg-muted text-muted-foreground",
};

/** Execution activity type → icon color class */
export const ACTIVITY_COLORS: Record<string, string> = {
  step: "text-info",
  llm: "text-primary",
  tool: "text-warning",
  retrieval: "text-info",
  parallel: "text-primary",
  loop: "text-success",
  error: "text-destructive",
  routing: "text-warning",
  delegation: "text-warning",
  direct_response: "text-success",
  agent_created: "text-primary",
  compaction: "text-info",
};

/** Health status dot colors */
export const HEALTH_COLORS = {
  healthy: "bg-success",
  unhealthy: "bg-destructive",
} as const;
