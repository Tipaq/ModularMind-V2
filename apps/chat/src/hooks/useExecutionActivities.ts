export { useExecutionActivities } from "@modularmind/ui";
export type { ExecutionActivity, ActivityType, ActivityStatus, ToolCallData } from "@modularmind/ui";

/** SSE trace event — re-exported from api-client for callers that need typed events. */
export type { TraceStreamEvent, StepStreamEvent } from "@modularmind/api-client";
export type SSETraceEvent = import("@modularmind/api-client").TraceStreamEvent | import("@modularmind/api-client").StepStreamEvent;
