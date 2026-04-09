import { RefreshCw, Settings, Trash2 } from "lucide-react";
import { Button, Badge, cn } from "@modularmind/ui";
import type { MCPServer } from "@modularmind/api-client";

interface McpServerListProps {
  servers: MCPServer[];
  testingId: string | null;
  getServerIcon: (server: MCPServer) => React.ElementType;
  onTest: (serverId: string) => void;
  onSettings: (server: MCPServer) => void;
  onRemove: (serverId: string) => void;
}

export function McpServerList({
  servers,
  testingId,
  getServerIcon,
  onTest,
  onSettings,
  onRemove,
}: McpServerListProps) {
  if (servers.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Active Servers
      </p>
      <div className="space-y-1.5">
        {servers.map((server) => {
          const IconComp = getServerIcon(server);
          const isTesting = testingId === server.id;
          return (
            <div
              key={server.id}
              className="flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative shrink-0">
                  <IconComp className="h-5 w-5 text-muted-foreground" />
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background",
                      server.connected ? "bg-success" : "bg-muted-foreground",
                    )}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{server.name}</p>
                    {server.connected && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                        {server.tools_count} tool{server.tools_count !== 1 ? "s" : ""}
                      </Badge>
                    )}
                    {!server.connected && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                        Offline
                      </Badge>
                    )}
                    {server.managed && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground"
                      >
                        Auto
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground"
                    >
                      {server.transport === "stdio" ? "Subprocess" : "HTTP"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {server.transport === "stdio"
                      ? "Local subprocess"
                      : server.managed
                        ? "Managed sidecar"
                        : server.url}
                    {server.description && ` \u2014 ${server.description}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 ml-3 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onTest(server.id)}
                  disabled={isTesting}
                  title="Test connection"
                >
                  <RefreshCw
                    className={cn("h-4 w-4 text-muted-foreground", isTesting && "animate-spin")}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSettings(server)}
                  title="Settings"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(server.id)}
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
