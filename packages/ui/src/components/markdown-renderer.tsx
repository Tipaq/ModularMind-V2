"use client";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import Markdown from "react-markdown";
import { CodeBlock } from "./code-block";
import type { DetectedArtifact } from "../types/artifact";

const ARTIFACT_MIN_LINES = 15;

interface MarkdownRendererProps {
  content: string;
  messageId?: string;
  onArtifactDetected?: (artifact: DetectedArtifact) => void;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  messageId,
  onArtifactDetected,
}: MarkdownRendererProps) {
  const artifactIndexRef = useRef(0);
  useEffect(() => { artifactIndexRef.current = 0; }, [content]);

  const handleCodeBlock = useCallback(
    (language: string, code: string) => {
      if (!onArtifactDetected || !messageId) return;
      const lineCount = code.split("\n").length;
      if (lineCount < ARTIFACT_MIN_LINES) return;
      const index = artifactIndexRef.current++;
      onArtifactDetected({
        id: `${messageId}-code-${index}`,
        type: "code",
        title: `Code block ${index + 1}`,
        language,
        content: code,
        lineCount,
        sourceMessageId: messageId,
      });
    },
    [onArtifactDetected, messageId, artifactIndexRef],
  );

  const components = useMemo(
    () => ({
      code: ({ className, children, ...rest }: React.ComponentPropsWithoutRef<"code"> & { className?: string }) => {
        const match = /language-(\w+)/.exec(className || "");
        const codeStr = String(children).replace(/\n$/, "");
        if (match) {
          handleCodeBlock(match[1], codeStr);
          return <CodeBlock language={match[1]}>{codeStr}</CodeBlock>;
        }
        return <code className={className} {...rest}>{children}</code>;
      },
      pre: ({ children }: React.ComponentPropsWithoutRef<"pre">) => <>{children}</>,
    }),
    [handleCodeBlock],
  );

  return <Markdown components={components}>{content}</Markdown>;
});
