"use client";

import { memo } from "react";
import { FileText, Image, File, Download } from "lucide-react";
import { cn } from "../lib/utils";

export interface AttachmentChipData {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
}

interface AttachmentChipProps {
  attachment: AttachmentChipData;
  /** Base URL prefix for download links. Default: "/api/v1/conversations" */
  downloadBaseUrl?: string;
  className?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function FileIcon({ contentType }: { contentType: string }) {
  const cls = "h-3 w-3 shrink-0 text-muted-foreground";
  if (contentType.startsWith("image/")) return <Image className={cls} />;
  if (contentType === "application/pdf" || contentType.startsWith("text/")) return <FileText className={cls} />;
  return <File className={cls} />;
}

export const AttachmentChip = memo(function AttachmentChip({
  attachment,
  downloadBaseUrl = "/api/v1/conversations",
  className,
}: AttachmentChipProps) {
  const downloadUrl = `${downloadBaseUrl}/attachments/${attachment.id}`;

  return (
    <a
      href={downloadUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs",
        "bg-background/50 hover:bg-muted transition-colors no-underline",
        className,
      )}
      title={`${attachment.filename} (${formatSize(attachment.size_bytes)})`}
    >
      <FileIcon contentType={attachment.content_type} />
      <span className="max-w-[120px] truncate">{attachment.filename}</span>
      <span className="text-muted-foreground">{formatSize(attachment.size_bytes)}</span>
      <Download className="h-2.5 w-2.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
    </a>
  );
});
