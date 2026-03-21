"use client";

import { useState } from "react";
import { Shield, ShieldCheck, ShieldAlert } from "lucide-react";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@modularmind/ui";

interface OperationConfig {
  name: string;
  label: string;
  description: string;
}

const ALL_OPERATIONS: OperationConfig[] = [
  { name: "read", label: "Read file", description: "Read text file contents" },
  {
    name: "read_media",
    label: "Read media",
    description: "Read binary files as base64",
  },
  {
    name: "read_multiple",
    label: "Batch read",
    description: "Read multiple files at once",
  },
  { name: "list", label: "List directory", description: "List files in a directory" },
  {
    name: "list_with_sizes",
    label: "List with sizes",
    description: "List with sizes and sorting",
  },
  { name: "tree", label: "Tree view", description: "Recursive directory tree" },
  { name: "info", label: "File info", description: "Get file metadata" },
  {
    name: "search",
    label: "Search (grep)",
    description: "Regex search in files",
  },
  { name: "write", label: "Write file", description: "Create or overwrite files" },
  {
    name: "edit",
    label: "Edit file",
    description: "Atomic text replacements",
  },
  { name: "delete", label: "Delete file", description: "Remove files" },
  { name: "move", label: "Move/rename", description: "Move or rename files" },
  {
    name: "mkdir",
    label: "Create directory",
    description: "Create directories",
  },
];

const DEFAULT_CRITICAL = new Set([
  "write",
  "edit",
  "delete",
  "move",
  "mkdir",
]);

export function FilesystemSecurityTab() {
  const [criticalOps, setCriticalOps] = useState<Set<string>>(
    new Set(DEFAULT_CRITICAL)
  );

  const toggleOperation = (name: string) => {
    setCriticalOps((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const safeOps = ALL_OPERATIONS.filter((op) => !criticalOps.has(op.name));
  const criticalOpsList = ALL_OPERATIONS.filter((op) =>
    criticalOps.has(op.name)
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Filesystem Security Groups
          </CardTitle>
          <CardDescription>
            Configure which filesystem operations run directly (fast, ~10ms) vs
            through the Docker sandbox (isolated, ~500ms). Click an operation to
            move it between groups.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-success">
                <ShieldCheck className="h-4 w-4" />
                Safe — Direct execution
              </div>
              <p className="text-xs text-muted-foreground">
                Read-only operations executed directly via subprocess (~10ms).
              </p>
              <div className="space-y-1.5">
                {safeOps.map((op) => (
                  <button
                    key={op.name}
                    type="button"
                    onClick={() => toggleOperation(op.name)}
                    className="flex w-full items-center justify-between rounded-md border border-success/30 bg-success/5 px-3 py-2 text-left transition-colors hover:bg-success/10"
                  >
                    <div>
                      <span className="text-sm font-medium">{op.label}</span>
                      <p className="text-xs text-muted-foreground">
                        {op.description}
                      </p>
                    </div>
                    <Badge variant="success" className="text-xs">
                      direct
                    </Badge>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-warning">
                <ShieldAlert className="h-4 w-4" />
                Critical — Docker sandbox
              </div>
              <p className="text-xs text-muted-foreground">
                Write/destructive operations isolated in Docker container
                (~500ms).
              </p>
              <div className="space-y-1.5">
                {criticalOpsList.map((op) => (
                  <button
                    key={op.name}
                    type="button"
                    onClick={() => toggleOperation(op.name)}
                    className="flex w-full items-center justify-between rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-left transition-colors hover:bg-warning/10"
                  >
                    <div>
                      <span className="text-sm font-medium">{op.label}</span>
                      <p className="text-xs text-muted-foreground">
                        {op.description}
                      </p>
                    </div>
                    <Badge variant="warning" className="text-xs">
                      sandbox
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
