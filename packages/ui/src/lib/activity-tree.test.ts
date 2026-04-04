import { describe, it, expect } from "vitest";
import { truncate, completeLastRunning, appendChild, updateChildDeep } from "./activity-tree";
import type { ExecutionActivity, ActivityType } from "../types/chat";

function makeActivity(
  overrides: Partial<ExecutionActivity> & { id: string; type: ActivityType },
): ExecutionActivity {
  return {
    label: "test",
    status: "running",
    startedAt: 1000,
    children: [],
    ...overrides,
  };
}

describe("truncate", () => {
  it("returns string unchanged when shorter than max", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns string unchanged when exactly max length", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and adds ellipsis when longer than max", () => {
    expect(truncate("hello world", 5)).toBe("hello\u2026");
  });
});

describe("completeLastRunning", () => {
  it("completes the last running activity of given type", () => {
    const activities = [
      makeActivity({ id: "1", type: "llm", status: "completed" }),
      makeActivity({ id: "2", type: "llm", status: "running", startedAt: 100 }),
    ];

    const result = completeLastRunning(activities, "llm", { durationMs: 500 });

    expect(result[1].status).toBe("completed");
    expect(result[1].durationMs).toBe(500);
  });

  it("calculates durationMs from startedAt when not provided in patch", () => {
    const now = Date.now();
    const activities = [
      makeActivity({ id: "1", type: "tool", status: "running", startedAt: now - 200 }),
    ];

    const result = completeLastRunning(activities, "tool", {});

    expect(result[0].status).toBe("completed");
    expect(result[0].durationMs).toBeGreaterThanOrEqual(199);
  });

  it("returns unchanged array when no running activity of type found", () => {
    const activities = [
      makeActivity({ id: "1", type: "llm", status: "completed" }),
    ];

    const result = completeLastRunning(activities, "tool", {});

    expect(result).toBe(activities);
  });

  it("applies extra patch fields", () => {
    const activities = [
      makeActivity({ id: "1", type: "llm", status: "running" }),
    ];

    const result = completeLastRunning(activities, "llm", {
      durationMs: 100,
      label: "updated",
    });

    expect(result[0].label).toBe("updated");
  });
});

describe("appendChild", () => {
  it("appends child to parent by id", () => {
    const parent = makeActivity({ id: "p1", type: "agent_execution" });
    const child = makeActivity({ id: "c1", type: "tool" });

    const result = appendChild([parent], "p1", child);

    expect(result[0].children).toHaveLength(1);
    expect(result[0].children![0].id).toBe("c1");
  });

  it("appends child to nested parent within graph_execution", () => {
    const nestedParent = makeActivity({ id: "node1", type: "agent_execution" });
    const graphExec = makeActivity({
      id: "g1",
      type: "graph_execution",
      children: [nestedParent],
    });
    const child = makeActivity({ id: "c1", type: "tool" });

    const result = appendChild([graphExec], "node1", child);

    expect(result[0].children![0].children).toHaveLength(1);
    expect(result[0].children![0].children![0].id).toBe("c1");
  });

  it("returns unchanged when parentId not found", () => {
    const activities = [makeActivity({ id: "1", type: "agent_execution" })];
    const child = makeActivity({ id: "c1", type: "tool" });

    const result = appendChild(activities, "nonexistent", child);

    expect(result[0].children).toHaveLength(0);
  });
});

describe("updateChildDeep", () => {
  it("updates last running child of given type under parent", () => {
    const child = makeActivity({ id: "c1", type: "llm", status: "running" });
    const parent = makeActivity({ id: "p1", type: "agent_execution", children: [child] });

    const result = updateChildDeep([parent], "p1", "llm", (c) => ({
      ...c,
      status: "completed",
      durationMs: 42,
    }));

    expect(result[0].children![0].status).toBe("completed");
    expect(result[0].children![0].durationMs).toBe(42);
  });

  it("updates nested child under graph_execution > parent", () => {
    const child = makeActivity({ id: "c1", type: "tool", status: "running" });
    const nestedParent = makeActivity({ id: "n1", type: "agent_execution", children: [child] });
    const graphExec = makeActivity({
      id: "g1",
      type: "graph_execution",
      children: [nestedParent],
    });

    const result = updateChildDeep([graphExec], "n1", "tool", (c) => ({
      ...c,
      status: "completed",
    }));

    expect(result[0].children![0].children![0].status).toBe("completed");
  });

  it("returns unchanged when no running child of type found", () => {
    const child = makeActivity({ id: "c1", type: "llm", status: "completed" });
    const parent = makeActivity({ id: "p1", type: "agent_execution", children: [child] });

    const result = updateChildDeep([parent], "p1", "llm", (c) => ({
      ...c,
      status: "completed",
    }));

    expect(result[0].children![0]).toBe(child);
  });
});
