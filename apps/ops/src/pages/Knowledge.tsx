import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  BookOpen, RefreshCw, Plus, Search, AlertCircle,
  BarChart3, Database, GitFork,
} from "lucide-react";
import {
  Button, Input,
  Tabs, TabsContent, TabsList, TabsTrigger,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  PageHeader, cn,
} from "@modularmind/ui";
import type { Collection } from "@modularmind/api-client";
import { useKnowledgeStore } from "../stores/knowledge";
import { useAuthStore } from "@modularmind/ui";
import { CollectionCard } from "../components/knowledge/CollectionCard";
import { CreateCollectionDialog } from "../components/knowledge/CreateCollectionDialog";
import { KnowledgeOverviewTab } from "../components/knowledge/KnowledgeOverviewTab";
import { KnowledgeExplorerTab } from "../components/knowledge/KnowledgeExplorerTab";
import { KnowledgeGraphTab } from "../components/knowledge/KnowledgeGraphTab";

type ScopeFilter = "all" | "company" | "projects" | "groups" | "personal";

function isProject(collection: Collection): boolean {
  return (collection.metadata as Record<string, unknown> | null)?.category === "project";
}

function filterByScope(collections: Collection[], scope: ScopeFilter, isAdmin: boolean, userId: string | undefined): Collection[] {
  if (scope === "company") return collections.filter((c) => c.scope === "global");
  if (scope === "projects") return collections.filter((c) => c.scope === "group" && isProject(c));
  if (scope === "groups") return collections.filter((c) => c.scope === "group" && !isProject(c));
  if (scope === "personal") return collections.filter((c) => c.scope === "agent" && (isAdmin || c.owner_user_id === userId));
  return collections;
}

function countByScope(collections: Collection[], isAdmin: boolean, userId: string | undefined) {
  return {
    company: collections.filter((c) => c.scope === "global").length,
    projects: collections.filter((c) => c.scope === "group" && isProject(c)).length,
    groups: collections.filter((c) => c.scope === "group" && !isProject(c)).length,
    personal: collections.filter((c) => c.scope === "agent" && (isAdmin || c.owner_user_id === userId)).length,
  };
}

function SkeletonGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/50" />
      ))}
    </div>
  );
}

function EmptyCollections() {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-12 text-center">
      <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/30" />
      <p className="mt-3 text-sm text-muted-foreground">No collections found</p>
    </div>
  );
}

function CollectionsContent() {
  const { collections, collectionsLoading, deleteCollection } = useKnowledgeStore();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin" || user?.role === "owner";

  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");

  const searchFiltered = collections.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase()) ||
      c.allowed_groups.some((g) => g.toLowerCase().includes(search.toLowerCase())),
  );

  const items = filterByScope(searchFiltered, scopeFilter, isAdmin, user?.id);
  const counts = countByScope(searchFiltered, isAdmin, user?.id);

  const canDelete = (c: Collection) =>
    isAdmin || (c.scope === "agent" && c.owner_user_id === user?.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="Search collections..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={scopeFilter} onValueChange={(v) => setScopeFilter(v as ScopeFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({searchFiltered.length})</SelectItem>
            <SelectItem value="company">Company ({counts.company})</SelectItem>
            <SelectItem value="projects">Projects ({counts.projects})</SelectItem>
            <SelectItem value="groups">Groups ({counts.groups})</SelectItem>
            <SelectItem value="personal">Personal ({counts.personal})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {collectionsLoading ? (
        <SkeletonGrid />
      ) : items.length === 0 ? (
        <EmptyCollections />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((col) => (
            <CollectionCard
              key={col.id}
              collection={col}
              onClick={() => navigate(`/knowledge/${col.id}`)}
              onDelete={() => deleteCollection(col.id)}
              canDelete={canDelete(col)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Knowledge() {
  const {
    collectionsLoading, collectionsError,
    fetchCollections, createCollection, clearError,
  } = useKnowledgeStore();

  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);

  const topTab = searchParams.get("tab") || "overview";

  useEffect(() => { fetchCollections(); }, [fetchCollections]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BookOpen}
        gradient="from-info to-info/70"
        title="Knowledge"
        description="Curated document collections for company, groups, and personal use"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCollections}
              disabled={collectionsLoading}
            >
              <RefreshCw className={cn("h-4 w-4", collectionsLoading && "animate-spin")} />
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Collection
            </Button>
          </div>
        }
      />

      {collectionsError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{collectionsError}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-destructive hover:text-destructive"
            onClick={clearError}
          >
            Dismiss
          </Button>
        </div>
      )}

      <Tabs value={topTab} onValueChange={(v) => setSearchParams({ tab: v })}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="collections" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Collections
          </TabsTrigger>
          <TabsTrigger value="explorer" className="gap-1.5">
            <Database className="h-3.5 w-3.5" />
            Explorer
          </TabsTrigger>
          <TabsTrigger value="graph" className="gap-1.5">
            <GitFork className="h-3.5 w-3.5" />
            Graph
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="collections">
            <CollectionsContent />
          </TabsContent>
          <TabsContent value="overview">
            <KnowledgeOverviewTab />
          </TabsContent>
          <TabsContent value="explorer">
            <KnowledgeExplorerTab />
          </TabsContent>
          <TabsContent value="graph">
            <KnowledgeGraphTab />
          </TabsContent>
        </div>
      </Tabs>

      <CreateCollectionDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={async (data) => {
          await createCollection(data);
          setCreateOpen(false);
        }}
      />
    </div>
  );
}
