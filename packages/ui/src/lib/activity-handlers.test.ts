import { describe, it, expect, vi } from "vitest";
import type { ExecutionActivity } from "../types/chat";
import {
  handleLlmStart,
  handleLlmEnd,
  handleToolStart,
  handleToolEnd,
  handleRetrieval,
  handleSupervisorEvents,
  handleErrorEvents,
  handleCompactionEvents,
} from "./activity-handlers";

type SetActivities = React.Dispatch<React.SetStateAction<ExecutionActivity[]>>;

function captureUpdater(setActivities: ReturnType<typeof vi.fn>) {
  const updater = setActivities.mock.calls[0]?.[0];
  if (typeof updater === "function") return updater;
  return () => updater;
}

function makeSeqRef() {
  return { current: 0 };
}

describe("handleLlmStart", () => {
  it("appends a running llm activity to root when no agentParent", () => {
    const setActivities = vi.fn();
    const seqRef = makeSeqRef();

    handleLlmStart({ type: "trace:llm_start", model: "gpt-4o" }, null, seqRef, setActivities as SetActivities);

    const updater = captureUpdater(setActivities);
    const result = updater([]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("llm");
    expect(result[0].status).toBe("running");
    expect(result[0].label).toContain("GPT");
  });
});

describe("handleLlmEnd", () => {
  it("completes last running llm activity", () => {
    const setActivities = vi.fn();
    const runningLlm: ExecutionActivity = {
      id: "llm-1", type: "llm", status: "running",
      label: "gpt-4o", startedAt: Date.now() - 500,
    };

    handleLlmEnd({ type: "trace:llm_end", duration_ms: 500 }, null, setActivities as SetActivities);

    const updater = captureUpdater(setActivities);
    const result = updater([runningLlm]);

    expect(result[0].status).toBe("completed");
  });
});

describe("handleToolStart", () => {
  it("appends a running tool activity with formatted name", () => {
    const setActivities = vi.fn();
    const seqRef = makeSeqRef();

    handleToolStart(
      { type: "trace:tool_start", tool_name: "web_search", input: '{"query": "test"}' },
      null, seqRef, setActivities as SetActivities,
    );

    const updater = captureUpdater(setActivities);
    const result = updater([]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("tool");
    expect(result[0].status).toBe("running");
  });
});

describe("handleToolEnd", () => {
  it("completes last running tool activity", () => {
    const setActivities = vi.fn();
    const runningTool: ExecutionActivity = {
      id: "tool-1", type: "tool", status: "running",
      label: "web_search", startedAt: Date.now() - 200,
    };

    handleToolEnd(
      { type: "trace:tool_end", tool_name: "web_search", result: "ok", duration_ms: 200 },
      null, setActivities as SetActivities,
    );

    const updater = captureUpdater(setActivities);
    const result = updater([runningTool]);

    expect(result[0].status).toBe("completed");
  });
});

describe("handleRetrieval", () => {
  it("creates a retrieval activity on trace:retrieval started", () => {
    const setActivities = vi.fn();
    const seqRef = makeSeqRef();

    handleRetrieval(
      { type: "trace:retrieval", status: "started", query: "test query" },
      seqRef, setActivities as SetActivities,
    );

    const updater = captureUpdater(setActivities);
    const result = updater([]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("retrieval");
    expect(result[0].status).toBe("running");
  });

  it("completes retrieval activity on trace:retrieval completed", () => {
    const setActivities = vi.fn();
    const seqRef = makeSeqRef();
    const runningRetrieval: ExecutionActivity = {
      id: "ret-1", type: "retrieval", status: "running",
      label: "Searching", startedAt: Date.now() - 100,
    };

    handleRetrieval(
      { type: "trace:retrieval", status: "completed", result_count: 5, duration_ms: 100 },
      seqRef, setActivities as SetActivities,
    );

    const updater = captureUpdater(setActivities);
    const result = updater([runningRetrieval]);

    expect(result[0].status).toBe("completed");
  });
});

describe("handleSupervisorEvents", () => {
  it("creates routing activity on trace:supervisor_routing", () => {
    const setActivities = vi.fn();
    const seqRef = makeSeqRef();
    const currentAgentIdRef = { current: null as string | null };

    handleSupervisorEvents(
      "trace:supervisor_routing",
      { type: "trace:supervisor_routing", decision: "delegate", target_agent: "Agent A" },
      seqRef, currentAgentIdRef, setActivities as SetActivities,
    );

    const updater = captureUpdater(setActivities);
    const result = updater([]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("routing");
  });
});

describe("handleErrorEvents", () => {
  it("creates a failed error activity", () => {
    const setActivities = vi.fn();
    const seqRef = makeSeqRef();

    handleErrorEvents(
      "trace:error",
      { type: "trace:error", error_type: "ToolError", message: "Tool failed" },
      seqRef, setActivities as SetActivities,
    );

    const updater = captureUpdater(setActivities);
    const result = updater([]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("error");
    expect(result[0].status).toBe("failed");
  });
});

describe("handleCompactionEvents", () => {
  it("creates compaction activity on trace:compaction_start", () => {
    const setActivities = vi.fn();
    const seqRef = makeSeqRef();

    handleCompactionEvents(
      "trace:compaction_start",
      { type: "trace:compaction_start" },
      seqRef, setActivities as SetActivities,
    );

    const updater = captureUpdater(setActivities);
    const result = updater([]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("compaction");
    expect(result[0].status).toBe("running");
  });

  it("completes compaction activity on trace:compaction_end", () => {
    const setActivities = vi.fn();
    const seqRef = makeSeqRef();
    const runningCompaction: ExecutionActivity = {
      id: "comp-1", type: "compaction", status: "running",
      label: "Compacting", startedAt: Date.now() - 100,
    };

    handleCompactionEvents(
      "trace:compaction_end",
      { type: "trace:compaction_end", duration_ms: 100 },
      seqRef, setActivities as SetActivities,
    );

    const updater = captureUpdater(setActivities);
    const result = updater([runningCompaction]);

    expect(result[0].status).toBe("completed");
  });
});
