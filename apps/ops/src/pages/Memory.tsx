import { Brain } from "lucide-react";
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@modularmind/ui";
import { MemoryOverviewTab } from "../components/memory/MemoryOverviewTab";
import { MemoryExplorerTab } from "../components/memory/MemoryExplorerTab";
import { MemoryGraphTab } from "../components/memory/MemoryGraphTab";
import { ConsolidationTab } from "../components/memory/ConsolidationTab";

export default function Memory() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Brain}
        gradient="from-primary to-primary/70"
        title="Memory"
        description="Manage and explore the AI memory system"
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="explorer">Explorer</TabsTrigger>
          <TabsTrigger value="graph">Graph</TabsTrigger>
          <TabsTrigger value="consolidation">Consolidation</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <MemoryOverviewTab />
        </TabsContent>

        <TabsContent value="explorer" className="mt-6">
          <MemoryExplorerTab />
        </TabsContent>

        <TabsContent value="graph" className="mt-6">
          <MemoryGraphTab />
        </TabsContent>

        <TabsContent value="consolidation" className="mt-6">
          <ConsolidationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
