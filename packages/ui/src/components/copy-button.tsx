"use client";

import { memo, useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "../lib/utils";

const COPIED_DURATION_MS = 2000;

interface CopyButtonProps {
  content: string;
  className?: string;
}

export const CopyButton = memo(function CopyButton({ content, className }: CopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), COPIED_DURATION_MS);
  }, [content]);

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "h-7 w-7 rounded-md flex items-center justify-center transition-colors",
        "text-muted-foreground hover:text-foreground hover:bg-muted",
        className,
      )}
      title={isCopied ? "Copied!" : "Copy"}
    >
      {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
});
