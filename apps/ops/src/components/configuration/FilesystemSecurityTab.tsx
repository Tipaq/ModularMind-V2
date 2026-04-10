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

const ALL_OPERATIONS = [
  { name: "read", label: "Read file" },
  { name: "read_media", label: "Read media" },
  { name: "read_multiple", label: "Batch read" },
  { name: "list", label: "List directory" },
  { name: "list_with_sizes", label: "List with sizes" },
  { name: "tree", label: "Tree view" },
  { name: "info", label: "File info" },
  { name: "search", label: "Search (grep)" },
  { name: "write", label: "Write file" },
  { name: "edit", label: "Edit file" },
  { name: "delete", label: "Delete file" },
  { name: "move", label: "Move/rename" },
  { name: "mkdir", label: "Create directory" },
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
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Filesystem Security</CardTitle>
            <CardDescription>
              Direct execution (~10ms) vs Docker sandbox (~500ms). Click to toggle.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-success">
              <ShieldCheck className="h-3.5 w-3.5" />
              Safe — Direct
            </div>
            <div className="space-y-1">
              {safeOps.map((op) => (
                <button
                  key={op.name}
                  type="button"
                  onClick={() => toggleOperation(op.name)}
                  className="flex w-full items-center justify-between rounded border border-success/20 bg-success/5 px-2.5 py-1.5 text-left transition-colors hover:bg-success/10"
                >
                  <span className="text-xs font-medium">{op.label}</span>
                  <Badge variant="success" className="text-[10px] px-1.5 py-0">direct</Badge>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-warning">
              <ShieldAlert className="h-3.5 w-3.5" />
              Critical — Sandbox
            </div>
            <div className="space-y-1">
              {criticalOpsList.map((op) => (
                <button
                  key={op.name}
                  type="button"
                  onClick={() => toggleOperation(op.name)}
                  className="flex w-full items-center justify-between rounded border border-warning/20 bg-warning/5 px-2.5 py-1.5 text-left transition-colors hover:bg-warning/10"
                >
                  <span className="text-xs font-medium">{op.label}</span>
                  <Badge variant="warning" className="text-[10px] px-1.5 py-0">sandbox</Badge>
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
