"use client";

import {
  Brain,
  BookOpen,
  Code,
  HardDrive,
  MessageSquare,
  Image,
  Puzzle,
  Terminal,
  Server,
  Wrench,
} from "lucide-react";
import { Badge } from "@modularmind/ui";
import type { ToolCategoryInfo } from "@modularmind/api-client";

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  builtin: Wrench,
  memory: Brain,
  knowledge: BookOpen,
  code_search: Code,
  file_storage: HardDrive,
  human_interaction: MessageSquare,
  image_generation: Image,
  custom_tools: Puzzle,
  gateway: Terminal,
  mcp: Server,
};

interface ToolCategoriesGridProps {
  categories: ToolCategoryInfo[];
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

function CategoryCard({
  category,
  isSelected,
  onSelect,
}: {
  category: ToolCategoryInfo;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const Icon = CATEGORY_ICONS[category.id] ?? Wrench;

  return (
    <button
      onClick={onSelect}
      className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-primary/50"
      }`}
    >
      <div className="rounded-md bg-muted p-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{category.label}</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
            {category.tool_count}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate">{category.description}</p>
      </div>
    </button>
  );
}

export function ToolCategoriesGrid({
  categories,
  selectedCategory,
  onSelectCategory,
}: ToolCategoriesGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {categories.map((cat) => (
        <CategoryCard
          key={cat.id}
          category={cat}
          isSelected={selectedCategory === cat.id}
          onSelect={() => onSelectCategory(selectedCategory === cat.id ? null : cat.id)}
        />
      ))}
    </div>
  );
}
