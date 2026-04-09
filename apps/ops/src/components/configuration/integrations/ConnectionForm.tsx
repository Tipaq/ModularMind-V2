"use client";

import {
  Eye,
  EyeOff,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@modularmind/ui";
import { EXECUTION_MODE_LABELS } from "./types";
import type { ConnectionFormProps, ExecutionMode } from "./types";

function TargetSelector({
  executionMode,
  selectedTargetId,
  onTargetChange,
  agents,
  graphs,
  models,
}: Pick<ConnectionFormProps, "executionMode" | "selectedTargetId" | "onTargetChange" | "agents" | "graphs" | "models">) {
  if (executionMode === "supervisor") return null;

  const targetOptions =
    executionMode === "agent"
      ? agents.map((a) => ({ id: a.id, label: a.name }))
      : executionMode === "graph"
        ? graphs.map((g) => ({ id: g.id, label: g.name }))
        : models.map((m) => ({
            id: m.model_id,
            label: m.display_name ?? m.model_id,
          }));

  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {EXECUTION_MODE_LABELS[executionMode]} <span className="text-destructive">*</span>
      </Label>
      <Select
        value={selectedTargetId}
        onValueChange={onTargetChange}
      >
        <SelectTrigger className="text-xs h-8">
          <SelectValue placeholder={`Select ${EXECUTION_MODE_LABELS[executionMode].toLowerCase()}...`} />
        </SelectTrigger>
        <SelectContent>
          {targetOptions.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ConnectionForm({
  typeDef,
  hasConnectors,
  formData,
  onUpdateField,
  visibleSecrets,
  onToggleSecret,
  executionMode,
  onExecutionModeChange,
  selectedTargetId,
  onTargetChange,
  connectorName,
  onConnectorNameChange,
  creating,
  onConnect,
  agents,
  graphs,
  models,
}: ConnectionFormProps) {
  return (
    <div className="mt-4 rounded-lg border border-dashed p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {hasConnectors ? "Add another connection" : "Setup guide"}
        </p>
        <a
          href={typeDef.doc_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3" />
          Documentation
        </a>
      </div>

      <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
        {typeDef.setup_steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>

      <div className="grid grid-cols-2 gap-3">
        {typeDef.fields.map((field) => {
          const secretKey = `${typeDef.type_id}-${field.key}`;
          const isPassword = field.is_secret;
          const isVisible = visibleSecrets.has(secretKey);

          return (
            <div key={field.key} className="space-y-1">
              <Label className="text-xs">
                {field.label}
                {field.is_required && (
                  <span className="text-destructive ml-0.5">*</span>
                )}
              </Label>
              <div className="relative">
                <Input
                  type={isPassword && !isVisible ? "password" : "text"}
                  placeholder={field.placeholder}
                  value={formData[field.key] || ""}
                  onChange={(e) => onUpdateField(field.key, e.target.value)}
                  className="text-xs h-8 pr-8"
                />
                {isPassword && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => onToggleSecret(secretKey)}
                  >
                    {isVisible ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-4 gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Connector Name</Label>
          <Input
            placeholder={`My ${typeDef.name} Bot`}
            value={connectorName}
            onChange={(e) => onConnectorNameChange(e.target.value)}
            className="text-xs h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Execution Mode</Label>
          <Select
            value={executionMode}
            onValueChange={(value) => onExecutionModeChange(value as ExecutionMode)}
          >
            <SelectTrigger className="text-xs h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="graph">Graph</SelectItem>
              <SelectItem value="supervisor">Supervisor</SelectItem>
              <SelectItem value="model">Direct LLM</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <TargetSelector
          executionMode={executionMode}
          selectedTargetId={selectedTargetId}
          onTargetChange={onTargetChange}
          agents={agents}
          graphs={graphs}
          models={models}
        />
        <Button
          onClick={onConnect}
          disabled={creating}
          className="h-8 text-xs"
        >
          {creating ? (
            <>
              <RefreshCw className="h-3 w-3 animate-spin mr-1" />
              Connecting...
            </>
          ) : (
            "Connect"
          )}
        </Button>
      </div>
    </div>
  );
}
