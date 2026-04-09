import { RefreshCw, Plus } from "lucide-react";
import { Button, Input, Label } from "@modularmind/ui";

interface McpManualFormProps {
  name: string;
  url: string;
  loading: boolean;
  onNameChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function McpManualForm({
  name,
  url,
  loading,
  onNameChange,
  onUrlChange,
  onSubmit,
  onCancel,
}: McpManualFormProps) {
  return (
    <div className="rounded-lg border border-dashed p-4 space-y-3">
      <p className="text-sm font-medium">Add MCP Server</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Server Name</Label>
          <Input
            placeholder="My MCP Server"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="text-xs h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Server URL</Label>
          <Input
            placeholder="http://localhost:3100/mcp"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            className="text-xs h-8"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={loading || !name || !url}>
          {loading ? (
            <RefreshCw className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Plus className="h-3 w-3 mr-1" />
          )}
          Add
        </Button>
      </div>
    </div>
  );
}
