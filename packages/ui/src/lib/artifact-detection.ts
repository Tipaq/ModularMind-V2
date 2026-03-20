import type { DetectedArtifact } from "../types/artifact";
import type { ExecutionActivity } from "../types/chat";

const FENCED_CODE_REGEX = /```(\w+)?\n([\s\S]*?)```/g;
const ARTIFACT_MIN_LINES = 15;
const FILE_TOOL_NAMES = ["write_file", "create_file", "save_file"];

export function extractCodeArtifacts(
  content: string,
  messageId: string,
): DetectedArtifact[] {
  const artifacts: DetectedArtifact[] = [];
  let match: RegExpExecArray | null;
  let index = 0;

  FENCED_CODE_REGEX.lastIndex = 0;
  while ((match = FENCED_CODE_REGEX.exec(content)) !== null) {
    const language = match[1] || "text";
    const code = match[2].trimEnd();
    const lineCount = code.split("\n").length;

    if (lineCount >= ARTIFACT_MIN_LINES) {
      artifacts.push({
        id: `${messageId}-code-${index}`,
        type: "code",
        title: `${language.charAt(0).toUpperCase() + language.slice(1)} (${lineCount} lines)`,
        language,
        content: code,
        lineCount,
        sourceMessageId: messageId,
      });
      index++;
    }
  }

  return artifacts;
}

export function extractToolArtifact(
  activity: ExecutionActivity,
  messageId: string,
): DetectedArtifact | null {
  if (activity.type !== "tool" || !activity.toolData) return null;

  const toolName = activity.toolData.toolName;
  if (!FILE_TOOL_NAMES.includes(toolName)) return null;

  const resultStr = activity.toolData.result;
  if (!resultStr) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(resultStr) as Record<string, unknown>;
  } catch {
    return null;
  }

  const filePath = (parsed.path || parsed.file_path || toolName) as string;
  const fileContent = (parsed.content || "") as string;
  const extension = filePath.split(".").pop() || "text";

  return {
    id: `${messageId}-file-${filePath}`,
    type: "file",
    title: filePath.split("/").pop() || filePath,
    language: extension,
    content: fileContent,
    lineCount: fileContent.split("\n").length,
    sourceMessageId: messageId,
  };
}
