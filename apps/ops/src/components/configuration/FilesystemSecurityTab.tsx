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
  { name: "read_media", label: "Read media", description: "Read binary files as base64" },
  { name: "read_multiple", label: "Batch read", description: "Read multiple files at once" },
  { name: "list", label: "List directory", description: "List files in a directory" },
  { name: "list_with_sizes", label: "List with sizes", description: "List with sizes and sorting" },
  { name: "tree", label: "Tree view", description: "Recursive directory tree" },
  { name: "info", label: "File info", description: "Get file metadata" },
  { name: "search", label: "Search (grep)", description: "Regex search in files" },
  { name: "write", label: "Write file", description: "Create or overwrite files" },
  { name: "edit", label: "Edit file", description: "Atomic text replacements" },
  { name: "delete", label: "Delete file", description: "Remove files" },
  { name: "move", label: "Move/rename", description: "Move or rename files" },
  { name: "mkdir", label: "Create directory", description: "Create directories" },
];

const DEFAULT_CRITICAL = new Set(["write", "edit", "delete", "move", "mkdir"]);

export function FilesystemSecurityTab() {
  const [criticalOps, setCriticalOps] = useState<Set<string>>(new Set(DEFAULT_CRITICAL));

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
  const criticalOpsList = ALL_OPERATIONS.filter((op) => criticalOps.has(op.name));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Filesystem Security</CardTitle>
            <CardDescription>
              Configure which operations run directly (~10ms) vs through Docker sandbox (~500ms).
              Click to move between groups.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          <OperationGroup
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Safe — Direct execution"
            description="Read-only operations via subprocess (~10ms)"
            operations={safeOps}
            badgeVariant="success"
            badgeLabel="direct"
            borderClass="border-success/30 bg-success/5 hover:bg-success/10"
            titleClass="text-success"
            onToggle={toggleOperation}
          />
          <OperationGroup
            icon={<ShieldAlert className="h-4 w-4" />}
            title="Critical — Docker sandbox"
            description="Write/destructive operations in container (~500ms)"
            operations={criticalOpsList}
            badgeVariant="warning"
            badgeLabel="sandbox"
            borderClass="border-warning/30 bg-warning/5 hover:bg-warning/10"
            titleClass="text-warning"
            onToggle={toggleOperation}
          />
        </div>
      </CardContent>
    </Card>
  );
}

interface OperationGroupProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  operations: OperationConfig[];
  badgeVariant: "success" | "warning";
  badgeLabel: string;
  borderClass: string;
  titleClass: string;
  onToggle: (name: string) => void;
}

function OperationGroup({
  icon,
  title,
  description,
  operations,
  badgeVariant,
  badgeLabel,
  borderClass,
  titleClass,
  onToggle,
}: OperationGroupProps) {
  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 text-sm font-medium ${titleClass}`}>
        {icon}
        {title}
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="space-y-1.5">
        {operations.map((op) => (
          <button
            key={op.name}
            type="button"
            onClick={() => onToggle(op.name)}
            className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors ${borderClass}`}
          >
            <div>
              <span className="text-sm font-medium">{op.label}</span>
              <p className="text-xs text-muted-foreground">{op.description}</p>
            </div>
            <Badge variant={badgeVariant} className="text-xs">
              {badgeLabel}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}
