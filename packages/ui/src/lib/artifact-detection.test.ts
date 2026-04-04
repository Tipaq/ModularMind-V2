import { describe, it, expect } from "vitest";
import { extractCodeArtifacts, extractToolArtifact } from "./artifact-detection";
import type { ExecutionActivity } from "../types/chat";

function makeLongCode(lines: number): string {
  return Array.from({ length: lines }, (_, i) => `const line${i} = ${i};`).join("\n");
}

describe("extractCodeArtifacts", () => {
  it("extracts fenced code blocks with >= 15 lines", () => {
    const code = makeLongCode(20);
    const content = `Some text\n\`\`\`typescript\n${code}\n\`\`\`\nMore text`;

    const result = extractCodeArtifacts(content, "msg-1");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("msg-1-code-0");
    expect(result[0].type).toBe("code");
    expect(result[0].language).toBe("typescript");
    expect(result[0].lineCount).toBe(20);
    expect(result[0].title).toBe("Typescript (20 lines)");
    expect(result[0].sourceMessageId).toBe("msg-1");
  });

  it("ignores code blocks with fewer than 15 lines", () => {
    const code = makeLongCode(5);
    const content = `\`\`\`js\n${code}\n\`\`\``;

    const result = extractCodeArtifacts(content, "msg-1");

    expect(result).toHaveLength(0);
  });

  it("defaults language to text when no fence tag", () => {
    const code = makeLongCode(16);
    const content = `\`\`\`\n${code}\n\`\`\``;

    const result = extractCodeArtifacts(content, "msg-1");

    expect(result[0].language).toBe("text");
    expect(result[0].title).toMatch(/^Text/);
  });

  it("handles multiple code blocks in one message", () => {
    const code = makeLongCode(15);
    const content = `\`\`\`python\n${code}\n\`\`\`\nSome text\n\`\`\`rust\n${code}\n\`\`\``;

    const result = extractCodeArtifacts(content, "msg-1");

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("msg-1-code-0");
    expect(result[0].language).toBe("python");
    expect(result[1].id).toBe("msg-1-code-1");
    expect(result[1].language).toBe("rust");
  });

  it("returns empty array when no code blocks", () => {
    expect(extractCodeArtifacts("just plain text", "msg-1")).toEqual([]);
  });
});

describe("extractToolArtifact", () => {
  const baseActivity: ExecutionActivity = {
    id: "a1",
    type: "tool",
    label: "write_file",
    status: "completed",
    startedAt: 1000,
    seq: 0,
    children: [],
    toolData: {
      toolName: "write_file",
      input: "{}",
      result: JSON.stringify({ path: "/src/utils.ts", content: "export const x = 1;" }),
    },
  };

  it("extracts file artifact from valid tool result", () => {
    const result = extractToolArtifact(baseActivity, "msg-1");

    expect(result).not.toBeNull();
    expect(result!.id).toBe("msg-1-file-/src/utils.ts");
    expect(result!.type).toBe("file");
    expect(result!.title).toBe("utils.ts");
    expect(result!.language).toBe("ts");
    expect(result!.content).toBe("export const x = 1;");
  });

  it("returns null for non-tool activities", () => {
    const activity = { ...baseActivity, type: "llm" as const };

    expect(extractToolArtifact(activity, "msg-1")).toBeNull();
  });

  it("returns null for tools not in FILE_TOOL_NAMES", () => {
    const activity = {
      ...baseActivity,
      toolData: { ...baseActivity.toolData!, toolName: "search_web" },
    };

    expect(extractToolArtifact(activity, "msg-1")).toBeNull();
  });

  it("returns null when no toolData result", () => {
    const activity = {
      ...baseActivity,
      toolData: { toolName: "write_file", input: "{}" },
    };

    expect(extractToolArtifact(activity, "msg-1")).toBeNull();
  });

  it("returns null on malformed JSON result", () => {
    const activity = {
      ...baseActivity,
      toolData: { ...baseActivity.toolData!, result: "not-json" },
    };

    expect(extractToolArtifact(activity, "msg-1")).toBeNull();
  });
});
