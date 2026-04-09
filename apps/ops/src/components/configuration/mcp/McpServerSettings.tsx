import { RefreshCw, Check, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Switch,
  cn,
} from "@modularmind/ui";
import type { MCPServer, MCPTool } from "@modularmind/api-client";

interface SettingsFormState {
  name: string;
  enabled: boolean;
  timeout_seconds: number;
  api_key: string;
}

interface McpServerSettingsProps {
  server: MCPServer;
  form: SettingsFormState;
  tools: MCPTool[];
  toolsLoading: boolean;
  saveLoading: boolean;
  onFormChange: (form: SettingsFormState) => void;
  onSave: () => void;
  onRefreshTools: () => void;
  onClose: () => void;
}

export function McpServerSettings({
  server,
  form,
  tools,
  toolsLoading,
  saveLoading,
  onFormChange,
  onSave,
  onRefreshTools,
  onClose,
}: McpServerSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Settings: {server.name}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Server Name</Label>
            <Input
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              className="text-xs h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Timeout (seconds)</Label>
            <Input
              type="number"
              min={5}
              max={120}
              value={form.timeout_seconds}
              onChange={(e) =>
                onFormChange({
                  ...form,
                  timeout_seconds: parseInt(e.target.value) || 30,
                })
              }
              className="text-xs h-8"
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Enabled</p>
            <p className="text-xs text-muted-foreground">
              Disable to temporarily stop using this server
            </p>
          </div>
          <Switch
            checked={form.enabled}
            onCheckedChange={(checked) => onFormChange({ ...form, enabled: checked })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">API Key (optional)</Label>
          <Input
            type="password"
            placeholder="Leave blank to keep current"
            value={form.api_key}
            onChange={(e) => onFormChange({ ...form, api_key: e.target.value })}
            className="text-xs h-8"
          />
        </div>

        <McpToolsList
          tools={tools}
          loading={toolsLoading}
          isConnected={server.connected}
          onRefresh={onRefreshTools}
        />

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saveLoading}>
            {saveLoading ? (
              <RefreshCw className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Check className="h-3 w-3 mr-1" />
            )}
            Save Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function McpToolsList({
  tools,
  loading,
  isConnected,
  onRefresh,
}: {
  tools: MCPTool[];
  loading: boolean;
  isConnected: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Available Tools
        </p>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("h-3 w-3 mr-1", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : tools.length > 0 ? (
        <div className="space-y-1">
          {tools.map((tool, index) => (
            <div key={`${tool.name}-${index}`} className="rounded border px-3 py-2 text-xs">
              <p className="font-medium">{tool.name}</p>
              {tool.description && (
                <p className="text-muted-foreground mt-0.5">{tool.description}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">
          {isConnected ? "No tools discovered" : "Server is offline"}
        </p>
      )}
    </div>
  );
}
