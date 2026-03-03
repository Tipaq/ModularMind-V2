import { useEffect, useState } from "react";
import { RefreshCw, BookOpen } from "lucide-react";
import { Card, CardContent, Badge } from "@modularmind/ui";
import { api } from "../../lib/api";
import type { UserCollection } from "./types";

const SCOPE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  global: "default",
  group: "secondary",
  agent: "outline",
};

export function UserKnowledgeTab({ userId }: { userId: string }) {
  const [collections, setCollections] = useState<UserCollection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<UserCollection[]>(
          `/admin/users/${userId}/collections`,
        );
        setCollections(res);
      } catch {
        setCollections([]);
      }
      setLoading(false);
    })();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (collections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <BookOpen className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          No knowledge collections accessible to this user.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {collections.length} collection{collections.length !== 1 ? "s" : ""} accessible
      </p>

      <div className="space-y-2">
        {collections.map((col) => (
          <Card key={col.id}>
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{col.name}</span>
                    <Badge
                      variant={SCOPE_VARIANT[col.scope] || "secondary"}
                      className="text-[10px]"
                    >
                      {col.scope}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{col.chunk_count} chunks</span>
                    {col.allowed_groups.length > 0 && (
                      <span>Groups: {col.allowed_groups.join(", ")}</span>
                    )}
                    <span>
                      Created: {new Date(col.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
