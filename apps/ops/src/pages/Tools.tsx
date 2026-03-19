import { useEffect, useState, useMemo } from "react";
import { Wrench } from "lucide-react";
import { PageHeader, Tabs, TabsList, TabsTrigger, TabsContent, Badge } from "@modularmind/ui";
import type { ToolSource } from "@modularmind/api-client";
import { useToolsStore } from "../stores/tools";
import { ToolCategoriesGrid } from "../components/tools/ToolCategoriesGrid";
import { ToolsTable } from "../components/tools/ToolsTable";

const SOURCE_TABS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "builtin", label: "Built-in" },
  { value: "extended", label: "Extended" },
  { value: "gateway", label: "Gateway" },
  { value: "mcp", label: "MCP" },
];

export default function Tools() {
  const { tools, categories, totalCount, loading, fetchTools } = useToolsStore();
  const [activeTab, setActiveTab] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  const filteredTools = useMemo(() => {
    let filtered = tools;

    if (activeTab !== "all") {
      filtered = filtered.filter((t) => t.source === (activeTab as ToolSource));
    }

    if (selectedCategory) {
      filtered = filtered.filter((t) => t.category === selectedCategory || t.category.startsWith(`${selectedCategory}:`));
    }

    if (search.trim()) {
      const query = search.toLowerCase();
      filtered = filtered.filter(
        (t) => t.name.toLowerCase().includes(query) || t.description.toLowerCase().includes(query),
      );
    }

    return filtered;
  }, [tools, activeTab, selectedCategory, search]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSelectedCategory(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Wrench}
        gradient="from-warning to-warning/70"
        title="Tools"
        description="All tools available to agents across built-in, extended, gateway, and MCP sources."
        actions={
          <Badge variant="outline" className="text-sm font-mono">
            {totalCount} tools
          </Badge>
        }
      />

      <ToolCategoriesGrid
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            {SOURCE_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools..."
            className="h-9 w-64 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {SOURCE_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <ToolsTable tools={filteredTools} loading={loading} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
