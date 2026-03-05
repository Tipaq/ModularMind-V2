"use client";

import type { ExecutionOutputData } from "../types/chat";

/** Extract the final response text from an execution output. */
export function extractResponse(output: ExecutionOutputData | null | undefined): string {
  if (!output) return "";
  if (typeof output.response === "string") return output.response;
  if (Array.isArray(output.messages)) {
    for (let i = output.messages.length - 1; i >= 0; i--) {
      const m = output.messages[i];
      if (m.type === "ai" && m.content) return m.content;
    }
  }
  if (output.node_outputs && typeof output.node_outputs === "object") {
    const values = Object.values(output.node_outputs);
    for (let i = values.length - 1; i >= 0; i--) {
      const resp = values[i]?.response;
      if (resp) return resp;
    }
  }
  return "";
}
