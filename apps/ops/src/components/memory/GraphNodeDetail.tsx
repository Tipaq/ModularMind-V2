import { MousePointerClick, User, Clock, Star, Eye, Tag, Layers, Link2 } from "lucide-react";
import { Card, CardContent, Badge, Separator } from "@modularmind/ui";
import { type MemoryGraphNode, type MemoryGraphData, type MemoryUser } from "../../stores/memory";
import { MemoryTypeBadge } from "./MemoryTypeBadge";

const USER_ID_DISPLAY_LENGTH = 8;

interface GraphNodeDetailProps {
  selectedNode: MemoryGraphNode | null;
  graphData: MemoryGraphData;
  memoryUsers: MemoryUser[];
  setSelectedNode: (node: MemoryGraphNode | null) => void;
}

export function GraphNodeDetail({
  selectedNode,
  graphData,
  memoryUsers,
  setSelectedNode,
}: GraphNodeDetailProps) {
  return (
    <Card className="w-72 shrink-0 h-[500px] overflow-y-auto">
      <CardContent className="pt-4 pb-4 space-y-0">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          Node details
        </p>
        {selectedNode ? (
          <div className="space-y-4">
            {/* Type + Tier */}
            <div className="flex items-center justify-between gap-2">
              <MemoryTypeBadge type={selectedNode.memory_type} />
              <Badge variant="outline" className="text-[10px] capitalize">
                {selectedNode.tier}
              </Badge>
            </div>

            {/* Content */}
            <p className="text-sm leading-relaxed text-foreground">
              {selectedNode.content}
            </p>

            <Separator />

            {/* User */}
            <div className="flex items-start gap-2">
              <User className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground mb-0.5">User</p>
                {selectedNode.user_id ? (() => {
                  const u = memoryUsers.find((u) => u.user_id === selectedNode.user_id);
                  return u?.email ? (
                    <p className="text-xs font-medium truncate" title={selectedNode.user_id}>{u.email}</p>
                  ) : (
                    <p className="text-xs font-medium font-mono truncate" title={selectedNode.user_id}>
                      {selectedNode.user_id.slice(0, USER_ID_DISPLAY_LENGTH)}…
                    </p>
                  );
                })() : (
                  <p className="text-xs text-muted-foreground italic">Global / no user</p>
                )}
              </div>
            </div>

            {/* Scope */}
            <div className="flex items-start gap-2">
              <Layers className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground mb-0.5">Scope</p>
                <p className="text-xs font-medium capitalize">{selectedNode.scope.replace("_", " ")}</p>
                <p className="text-[10px] text-muted-foreground font-mono truncate" title={selectedNode.scope_id}>
                  {selectedNode.scope_id}
                </p>
              </div>
            </div>

            <Separator />

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-start gap-1.5">
                <Star className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Importance</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {Math.round(selectedNode.importance * 100)}%
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <Eye className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Accesses</p>
                  <p className="text-sm font-semibold tabular-nums">{selectedNode.access_count}</p>
                </div>
              </div>
            </div>

            {/* Tags */}
            {selectedNode.tags.length > 0 && (
              <div className="flex items-start gap-2">
                <Tag className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground mb-1">Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedNode.tags.map((t, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] border-warning/50 text-warning">
                        #{t}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Entities */}
            {selectedNode.entities.length > 0 && (
              <div className="flex items-start gap-2">
                <Tag className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground mb-1">Entities</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedNode.entities.map((e, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">
                        {e}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Connections */}
            {(() => {
              const conns = graphData.edges
                .filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
                .map(e => {
                  const neighborId = e.source === selectedNode.id ? e.target : e.source;
                  const neighbor = graphData.nodes.find(n => n.id === neighborId);
                  return neighbor ? { node: neighbor, edge_type: e.edge_type } : null;
                })
                .filter((c): c is { node: MemoryGraphNode; edge_type: string } => c !== null);
              if (!conns.length) return null;
              return (
                <>
                  <Separator />
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Link2 className="h-3 w-3" />
                      Connected to ({conns.length})
                    </p>
                    {conns.map(({ node, edge_type }, i) => (
                      <button key={i} className="w-full text-left" onClick={() => setSelectedNode(node)}>
                        <div className="rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors px-2.5 py-1.5 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <MemoryTypeBadge type={node.memory_type} />
                            <Badge variant="outline" className="text-[9px] ml-auto capitalize">
                              {edge_type.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                            {node.content}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}

            <Separator />

            {/* Dates */}
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Created</p>
                  <p className="text-xs">{new Date(selectedNode.created_at).toLocaleString()}</p>
                </div>
              </div>
              {selectedNode.last_accessed && (
                <div className="flex items-start gap-2">
                  <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Last accessed</p>
                    <p className="text-xs">{new Date(selectedNode.last_accessed).toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>

            {/* ID */}
            <div className="pt-1">
              <p className="text-[10px] text-muted-foreground/60 font-mono truncate" title={selectedNode.id}>
                {selectedNode.id}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-52 gap-2 text-muted-foreground">
            <MousePointerClick className="h-5 w-5" />
            <p className="text-xs text-center">Click a node to see its details</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
