import type { ActivityType, ExecutionActivity } from "../types/chat";

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\u2026";
}

export function completeLastRunning(
  prev: ExecutionActivity[],
  type: ActivityType,
  patch: Partial<ExecutionActivity>,
): ExecutionActivity[] {
  const realIdx = prev.findLastIndex((a) => a.type === type && a.status === "running");
  if (realIdx === -1) return prev;
  const updated = [...prev];
  updated[realIdx] = {
    ...updated[realIdx],
    status: "completed",
    durationMs: patch.durationMs ?? Date.now() - updated[realIdx].startedAt,
    ...patch,
  };
  return updated;
}

export function appendChild(
  prev: ExecutionActivity[],
  parentId: string,
  child: ExecutionActivity,
): ExecutionActivity[] {
  return prev.map((a) => {
    if (a.id === parentId) {
      return { ...a, children: [...(a.children || []), child] };
    }
    if (a.type === "graph_execution" && a.children?.some((c) => c.id === parentId)) {
      return {
        ...a,
        children: a.children!.map((c) =>
          c.id === parentId
            ? { ...c, children: [...(c.children || []), child] }
            : c,
        ),
      };
    }
    return a;
  });
}

export function updateChildDeep(
  prev: ExecutionActivity[],
  parentId: string,
  childType: ActivityType,
  updater: (child: ExecutionActivity) => ExecutionActivity,
): ExecutionActivity[] {
  return prev.map((a) => {
    if (a.id === parentId) {
      const children = [...(a.children || [])];
      const idx = children.findLastIndex((c) => c.type === childType && c.status === "running");
      if (idx === -1) return a;
      children[idx] = updater(children[idx]);
      return { ...a, children };
    }
    if (a.type === "graph_execution" && a.children?.some((c) => c.id === parentId)) {
      return {
        ...a,
        children: a.children!.map((c) => {
          if (c.id !== parentId) return c;
          const children = [...(c.children || [])];
          const idx = children.findLastIndex((ch) => ch.type === childType && ch.status === "running");
          if (idx === -1) return c;
          children[idx] = updater(children[idx]);
          return { ...c, children };
        }),
      };
    }
    return a;
  });
}
