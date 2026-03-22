import { useState } from "react";
import { Save, X, Edit, Wrench } from "lucide-react";
import { Button, Switch } from "@modularmind/ui";
import type { AgentDetail, AgentUpdateInput } from "@modularmind/api-client";

interface AgentToolsTabProps {
  agent: AgentDetail;
  onSave: (data: AgentUpdateInput) => Promise<void>;
}

const TOOL_CATEGORIES: { key: string; label: string; description: string }[] = [
  { key: "knowledge", label: "Knowledge", description: "Search and retrieve from knowledge bases" },
  { key: "filesystem", label: "Filesystem", description: "Read and write local files" },
  { key: "file_storage", label: "File Storage", description: "Upload and manage S3/MinIO files" },
  {
    key: "human_interaction",
    label: "Human Interaction",
    description: "Request input or approval from users",
  },
  {
    key: "image_generation",
    label: "Image Generation",
    description: "Generate images via AI models",
  },
  { key: "custom_tools", label: "Custom Tools", description: "User-defined MCP tool servers" },
  { key: "mini_apps", label: "Mini Apps", description: "Execute mini app workflows" },
  { key: "github", label: "GitHub", description: "Interact with GitHub repositories and issues" },
  { key: "web", label: "Web", description: "Browse and scrape web pages" },
  { key: "git", label: "Git", description: "Execute git operations" },
  { key: "scheduling", label: "Scheduling", description: "Create and manage scheduled tasks" },
];

export function AgentToolsTab({ agent, onSave }: AgentToolsTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Record<string, boolean>>(
    agent.tool_categories || {},
  );

  const startEditing = () => setIsEditing(true);
  const cancelEditing = () => {
    setCategories(agent.tool_categories || {});
    setIsEditing(false);
  };

  const handleToggle = (key: string, checked: boolean) => {
    setCategories((prev) => ({ ...prev, [key]: checked }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ tool_categories: categories });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = Object.values(
    isEditing ? categories : agent.tool_categories,
  ).filter(Boolean).length;

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Wrench className="h-3.5 w-3.5" />
          Tool Categories ({enabledCount} enabled)
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={saving}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={startEditing}>
              <Edit className="h-4 w-4 mr-1" /> Edit
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        {TOOL_CATEGORIES.map((cat) => {
          const isEnabled = isEditing
            ? categories[cat.key] ?? false
            : agent.tool_categories[cat.key] ?? false;

          return (
            <div
              key={cat.key}
              className="flex items-center justify-between py-2.5 px-3 rounded-md hover:bg-muted/50 transition-colors"
            >
              <div>
                <p className="text-sm font-medium">{cat.label}</p>
                <p className="text-xs text-muted-foreground">{cat.description}</p>
              </div>
              <Switch
                checked={isEnabled}
                onCheckedChange={(checked) => handleToggle(cat.key, checked)}
                disabled={!isEditing}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
