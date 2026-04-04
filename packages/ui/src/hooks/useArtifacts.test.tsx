import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useArtifacts } from "./useArtifacts";
import type { DetectedArtifact } from "../types/artifact";

function makeArtifact(id: string): DetectedArtifact {
  return {
    id,
    type: "code",
    title: `Artifact ${id}`,
    language: "typescript",
    content: "const x = 1;",
    lineCount: 1,
    sourceMessageId: "msg-1",
  };
}

describe("useArtifacts", () => {
  it("starts with empty artifacts and null selectedArtifactId", () => {
    const { result } = renderHook(() => useArtifacts());

    expect(result.current.artifacts).toEqual([]);
    expect(result.current.selectedArtifactId).toBeNull();
    expect(result.current.selectedArtifact).toBeNull();
  });

  it("addArtifact adds to list", () => {
    const { result } = renderHook(() => useArtifacts());

    act(() => result.current.addArtifact(makeArtifact("a1")));

    expect(result.current.artifacts).toHaveLength(1);
    expect(result.current.artifacts[0].id).toBe("a1");
  });

  it("addArtifact deduplicates by id", () => {
    const { result } = renderHook(() => useArtifacts());

    act(() => {
      result.current.addArtifact(makeArtifact("a1"));
      result.current.addArtifact(makeArtifact("a1"));
    });

    expect(result.current.artifacts).toHaveLength(1);
  });

  it("selectArtifact sets selectedArtifactId and selectedArtifact", () => {
    const { result } = renderHook(() => useArtifacts());

    act(() => result.current.addArtifact(makeArtifact("a1")));
    act(() => result.current.selectArtifact("a1"));

    expect(result.current.selectedArtifactId).toBe("a1");
    expect(result.current.selectedArtifact?.id).toBe("a1");
  });

  it("clearArtifacts resets all state", () => {
    const { result } = renderHook(() => useArtifacts());

    act(() => {
      result.current.addArtifact(makeArtifact("a1"));
      result.current.selectArtifact("a1");
    });
    act(() => result.current.clearArtifacts());

    expect(result.current.artifacts).toEqual([]);
    expect(result.current.selectedArtifactId).toBeNull();
    expect(result.current.selectedArtifact).toBeNull();
  });
});
