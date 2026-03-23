import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { Badge, SectionCard } from "@modularmind/ui";
import type { AgentDetail, AgentUpdateInput, ToolCategories } from "@modularmind/api-client";
import { TOOL_CATEGORIES, isCategoryEnabled } from "./tool-categories";
import { ToolCategoryPicker } from "./ToolCategoryPicker";

interface AgentToolsSectionProps {
  agent: AgentDetail;
  isEditing: boolean;
  onChange: (data: AgentUpdateInput) => void;
}

export function AgentToolsSection({ agent, isEditing, onChange }: AgentToolsSectionProps) {
  const [categories, setCategories] = useState<ToolCategories>(agent.tool_categories || {});

  useEffect(() => {
    if (!isEditing) {
      setCategories(agent.tool_categories || {});
    }
  }, [isEditing, agent]);

  const handleChange = (next: ToolCategories) => {
    setCategories(next);
    onChange({ tool_categories: next });
  };

  const currentCategories = isEditing ? categories : agent.tool_categories;
  const enabledCount = Object.values(currentCategories).filter(isCategoryEnabled).length;

  return (
    <SectionCard
      icon={Wrench}
      title="Tools"
      variant="card"
      trailing={
        <Badge variant="secondary" className="text-[10px] tabular-nums">
          {enabledCount} / {TOOL_CATEGORIES.length}
        </Badge>
      }
    >
      <ToolCategoryPicker
        categories={currentCategories}
        onChange={handleChange}
        disabled={!isEditing}
      />
    </SectionCard>
  );
}
