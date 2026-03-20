"use client";

import { memo, useEffect, useRef } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-css";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import { CopyButton } from "./copy-button";
import { cn } from "../lib/utils";

const LANGUAGE_ALIASES: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  py: "python",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  dockerfile: "docker",
};

function resolveLanguage(language: string): string {
  const lower = language.toLowerCase();
  return LANGUAGE_ALIASES[lower] ?? lower;
}

function formatLanguageLabel(language: string): string {
  return language.charAt(0).toUpperCase() + language.slice(1);
}

interface CodeBlockProps {
  language: string;
  children: string;
  className?: string;
}

export const CodeBlock = memo(function CodeBlock({ language, children, className }: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null);
  const resolvedLanguage = resolveLanguage(language);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [children, resolvedLanguage]);

  return (
    <div className={cn("rounded-lg overflow-hidden my-3", className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted-foreground/10 text-muted-foreground text-xs">
        <span>{formatLanguageLabel(resolvedLanguage)}</span>
        <CopyButton content={children} />
      </div>
      <pre className="!mt-0 !mb-0 !rounded-t-none">
        <code ref={codeRef} className={`language-${resolvedLanguage}`}>
          {children}
        </code>
      </pre>
    </div>
  );
});
