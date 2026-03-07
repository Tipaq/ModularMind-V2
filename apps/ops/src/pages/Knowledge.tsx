import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BookOpen, RefreshCw, Plus, Search, Globe, Users, User, AlertCircle, FolderKanban,
  BarChart3, Database, GitFork,
} from "lucide-react";
import {
  Button, Input, Badge,
  Tabs, TabsContent, TabsList, TabsTrigger,
  PageHeader, cn,
} from "@modularmind/ui";
import type { Collection } from "@modularmind/api-client";
import { useKnowledgeStore } from "../stores/knowledge";
import { useAuthStore } from "@modularmind/ui";
import { CollectionCard } from "../components/knowledge/CollectionCard";
import { CreateCollectionDialog } from "../components/knowledge/CreateCollectionDialog";
import { CollectionDetailPanel } from "../components/knowledge/CollectionDetailPanel";
import { KnowledgeOverviewTab } from "../components/knowledge/KnowledgeOverviewTab";
import { KnowledgeExplorerTab } from "../components/knowledge/KnowledgeExplorerTab";
import { KnowledgeGraphTab } from "../components/knowledge/KnowledgeGraphTab";

function EmptyCollections({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-12 text-center">
      <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/30" />
      <p className="mt-3 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/50" />
      ))}
    </div>
  );
}

function CollectionGrid({
  items,
  emptyLabel,
  loading,
  selectedCollectionId,
  onSelect,
  onDelete,
  canDelete,
}: {
  items: Collection[];
  emptyLabel: string;
  loading: boolean;
  selectedCollectionId: string | null;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  canDelete: (c: Collection) => boolean;
}) {
  if (loading) return <SkeletonGrid />;
  if (!items.length) return <EmptyCollections label={emptyLabel} />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((col) => (
        <CollectionCard
          key={col.id}
          collection={col}
          isSelected={col.id === selectedCollectionId}
          onClick={() => onSelect(col.id === selectedCollectionId ? null : col.id)}
          onDelete={() => onDelete(col.id)}
          canDelete={canDelete(col)}
        />
      ))}
    </div>
  );
}

// ── Collections Tab Content ──

function CollectionsContent() {
  const {
    collections, collectionsLoading,
    selectedCollectionId, documents, documentsLoading,
    fetchCollections, deleteCollection, selectCollection,
  } = useKnowledgeStore();

  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin" || user?.role === "owner";

  const [search, setSearch] = useState("");

  const selectedCollection = collections.find((c) => c.id === selectedCollectionId) ?? null;

  const filtered = collections.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase()) ||
      c.allowed_groups.some((g) => g.toLowerCase().includes(search.toLowerCase())),
  );

  const companyCollections  = filtered.filter((c) => c.scope === "global");
  const isProject = (c: Collection) =>
    (c.metadata as Record<string, unknown> | null)?.category === "project";
  const projectCollections  = filtered.filter((c) => c.scope === "group" && isProject(c));
  const groupCollections    = filtered.filter((c) => c.scope === "group" && !isProject(c));
  const personalCollections = filtered.filter(
    (c) => c.scope === "agent" && (isAdmin || c.owner_user_id === user?.id),
  );

  const canDelete = (c: Collection) =>
    isAdmin || (c.scope === "agent" && c.owner_user_id === user?.id);

  return (
    <>
      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9"
          placeholder="Search collections…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Grid + detail panel side by side */}
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <Tabs defaultValue="company">
            <TabsList>
              <TabsTrigger value="company" className="gap-1.5">
                <Globe className="h-3.5 w-3.5" />
                Company
                {companyCollections.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">
                    {companyCollections.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="projects" className="gap-1.5">
                <FolderKanban className="h-3.5 w-3.5" />
                Projects
                {projectCollections.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">
                    {projectCollections.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="groups" className="gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Groups
                {groupCollections.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">
                    {groupCollections.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="personal" className="gap-1.5">
                <User className="h-3.5 w-3.5" />
                Personal
                {personalCollections.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">
                    {personalCollections.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="mt-4">
              <TabsContent value="company">
                <CollectionGrid
                  items={companyCollections}
                  emptyLabel={
                    isAdmin
                      ? "No company-wide collections yet — create one to share knowledge with all users"
                      : "No company-wide collections available"
                  }
                  loading={collectionsLoading}
                  selectedCollectionId={selectedCollectionId}
                  onSelect={selectCollection}
                  onDelete={deleteCollection}
                  canDelete={canDelete}
                />
              </TabsContent>

              <TabsContent value="projects">
                {projectCollections.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {[...new Set(projectCollections.flatMap((c) => c.allowed_groups))].map((g) => (
                      <Badge
                        key={g}
                        variant="outline"
                        className="text-[11px] cursor-pointer hover:bg-muted"
                        onClick={() => setSearch(search === g ? "" : g)}
                      >
                        {g}
                      </Badge>
                    ))}
                  </div>
                )}
                <CollectionGrid
                  items={projectCollections}
                  emptyLabel="No project collections yet — create one and tag it as a project"
                  loading={collectionsLoading}
                  selectedCollectionId={selectedCollectionId}
                  onSelect={selectCollection}
                  onDelete={deleteCollection}
                  canDelete={canDelete}
                />
              </TabsContent>

              <TabsContent value="groups">
                {groupCollections.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {[...new Set(groupCollections.flatMap((c) => c.allowed_groups))].map((g) => (
                      <Badge
                        key={g}
                        variant="outline"
                        className="text-[11px] cursor-pointer hover:bg-muted"
                        onClick={() => setSearch(search === g ? "" : g)}
                      >
                        {g}
                      </Badge>
                    ))}
                  </div>
                )}
                <CollectionGrid
                  items={groupCollections}
                  emptyLabel="No group collections yet — create one and assign it to one or more groups"
                  loading={collectionsLoading}
                  selectedCollectionId={selectedCollectionId}
                  onSelect={selectCollection}
                  onDelete={deleteCollection}
                  canDelete={canDelete}
                />
              </TabsContent>

              <TabsContent value="personal">
                <CollectionGrid
                  items={personalCollections}
                  emptyLabel="No personal collections yet — upload your own documents here"
                  loading={collectionsLoading}
                  selectedCollectionId={selectedCollectionId}
                  onSelect={selectCollection}
                  onDelete={deleteCollection}
                  canDelete={canDelete}
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {selectedCollection && (
          <CollectionDetailPanel
            collection={selectedCollection}
            documents={documents}
            documentsLoading={documentsLoading}
            onClose={() => selectCollection(null)}
          />
        )}
      </div>
    </>
  );
}

// ── Main Page ──

export default function Knowledge() {
  const {
    collectionsLoading, collectionsError,
    fetchCollections, createCollection, clearError,
  } = useKnowledgeStore();

  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);

  const topTab = searchParams.get("tab") || "collections";

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

      {/* Top-level tabs */}
      <Tabs
        value={topTab}
        onValueChange={(v) => setSearchParams({ tab: v })}
      >
        <TabsList>
          <TabsTrigger value="collections" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Collections
          </TabsTrigger>
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Overview
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

        <div className="mt-4 space-y-4">
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
