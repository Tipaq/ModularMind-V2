import { useEffect, useState, useMemo } from "react";
import { Wrench, Search } from "lucide-react";
import {
  PageHeader,
  Badge,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@modularmind/ui";
import { useToolsStore } from "../stores/tools";
import { ToolsTable } from "../components/tools/ToolsTable";

export function Tools() {
  const { tools, categories, totalCount, loading, fetchTools } = useToolsStore();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  const activeCategories = useMemo(
    () => categories.filter((cat) => cat.tool_count > 0),
    [categories],
  );

  const filteredTools = useMemo(() => {
    let filtered = tools;

    if (selectedCategory !== "all") {
      filtered = filtered.filter(
        (t) => t.category === selectedCategory || t.category.startsWith(`${selectedCategory}:`),
      );
    }

    if (search.trim()) {
      const query = search.toLowerCase();
      filtered = filtered.filter(
        (t) => t.name.toLowerCase().includes(query) || t.description.toLowerCase().includes(query),
      );
    }

    return filtered;
  }, [tools, selectedCategory, search]);

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

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories ({totalCount})</SelectItem>
            {activeCategories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.label} ({cat.tool_count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ToolsTable tools={filteredTools} loading={loading} />
    </div>
  );
}
