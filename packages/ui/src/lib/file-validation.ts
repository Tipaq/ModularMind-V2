import type { AttachedFile } from "../types/chat";

const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

const ALLOWED_EXTENSIONS = ["pdf", "txt", "csv", "md", "json", "docx", "png", "jpg", "jpeg", "gif", "webp"];

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export interface FileValidationResult {
  validFiles: AttachedFile[];
  errorMessage: string | null;
}

export function validateFiles(files: FileList | File[]): FileValidationResult {
  const validFiles: AttachedFile[] = [];
  let errorMessage: string | null = null;

  for (const file of Array.from(files)) {
    if (file.size > MAX_FILE_SIZE) {
      errorMessage = `${file.name} is too large (max 25MB)`;
      continue;
    }
    if (file.type && !ALLOWED_FILE_TYPES.includes(file.type)) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext && !ALLOWED_EXTENSIONS.includes(ext)) {
        errorMessage = `${file.name}: unsupported file type`;
        continue;
      }
    }
    validFiles.push({
      file,
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
  }

  return { validFiles, errorMessage };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
