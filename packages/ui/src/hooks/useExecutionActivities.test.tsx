import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useExecutionActivities } from "./useExecutionActivities";

describe("useExecutionActivities", () => {
  it("starts with empty activities", () => {
    const { result } = renderHook(() => useExecutionActivities());

    expect(result.current.activities).toEqual([]);
  });

  it("reset() clears activities", () => {
    const { result } = renderHook(() => useExecutionActivities());

    act(() => result.current.handleEvent({ type: "trace:llm_start", model: "gpt-4o" }));
    act(() => result.current.reset());

    expect(result.current.activities).toEqual([]);
  });

  it("handles trace:llm_start → trace:llm_end lifecycle", () => {
    const { result } = renderHook(() => useExecutionActivities());

    act(() => result.current.handleEvent({ type: "trace:llm_start", model: "gpt-4o" }));

    expect(result.current.activities).toHaveLength(1);
    expect(result.current.activities[0].type).toBe("llm");
    expect(result.current.activities[0].status).toBe("running");

    act(() => result.current.handleEvent({ type: "trace:llm_end", duration_ms: 500 }));

    expect(result.current.activities[0].status).toBe("completed");
  });

  it("handles trace:tool_start → trace:tool_end lifecycle", () => {
    const { result } = renderHook(() => useExecutionActivities());

    act(() => result.current.handleEvent({ type: "trace:tool_start", tool_name: "web_search", input: "{}" }));

    expect(result.current.activities).toHaveLength(1);
    expect(result.current.activities[0].type).toBe("tool");
    expect(result.current.activities[0].status).toBe("running");

    act(() => result.current.handleEvent({ type: "trace:tool_end", tool_name: "web_search", duration_ms: 200 }));

    expect(result.current.activities[0].status).toBe("completed");
  });

  it("handles trace:graph_start → trace:graph_end lifecycle", () => {
    const { result } = renderHook(() => useExecutionActivities());

    act(() => result.current.handleEvent({ type: "trace:graph_start", graph_name: "RAG Pipeline" }));

    expect(result.current.activities).toHaveLength(1);
    expect(result.current.activities[0].type).toBe("graph_execution");
    expect(result.current.activities[0].label).toBe("RAG Pipeline");
    expect(result.current.activities[0].status).toBe("running");

    act(() => result.current.handleEvent({ type: "trace:graph_end" }));

    expect(result.current.activities[0].status).toBe("completed");
  });

  it("handles trace:node_start → trace:node_end lifecycle", () => {
    const { result } = renderHook(() => useExecutionActivities());

    act(() => result.current.handleEvent({ type: "trace:node_start", node_name: "Retrieve" }));

    expect(result.current.activities).toHaveLength(1);
    expect(result.current.activities[0].type).toBe("step");
    expect(result.current.activities[0].label).toBe("Retrieve");

    act(() => result.current.handleEvent({ type: "trace:node_end", duration_ms: 100 }));

    expect(result.current.activities[0].status).toBe("completed");
  });

  it("finalize() completes all running activities recursively", () => {
    const { result } = renderHook(() => useExecutionActivities());

    act(() => {
      result.current.handleEvent({ type: "trace:graph_start", graph_name: "Pipeline" });
      result.current.handleEvent({ type: "trace:llm_start", model: "gpt-4o" });
    });

    expect(result.current.activities.some((a) => a.status === "running")).toBe(true);

    act(() => result.current.finalize());

    expect(result.current.activities.every((a) => a.status === "completed")).toBe(true);
  });

  it("ignores events with no type", () => {
    const { result } = renderHook(() => useExecutionActivities());

    act(() => result.current.handleEvent({ data: "no type field" }));

    expect(result.current.activities).toEqual([]);
  });
});
