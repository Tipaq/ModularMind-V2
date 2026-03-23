import { Plus, Trash2 } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@modularmind/ui";
import { NODE_CONFIG, type NodeType } from "./nodes/nodeConfig";

const addableNodeTypes: NodeType[] = [
  "agent",
  "tool",
  "subgraph",
  "condition",
  "parallel",
  "merge",
  "loop",
  "supervisor",
];

interface GraphToolbarProps {
  onAddNode: (type: NodeType) => void;
  onDeleteSelected: () => void;
  hasSelection: boolean;
  isEditMode?: boolean;
}

export function GraphToolbar({
  onAddNode,
  onDeleteSelected,
  hasSelection,
  isEditMode = true,
}: GraphToolbarProps) {
  if (!isEditMode) return null;

  return (
    <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="bg-background/90 backdrop-blur-sm shadow-sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Node
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {addableNodeTypes.map((type) => {
            const config = NODE_CONFIG[type];
            const Icon = config.icon;
            return (
              <DropdownMenuItem key={type} onClick={() => onAddNode(type)}>
                <Icon className="h-4 w-4 mr-2" />
                {config.label}
                <span className="ml-auto text-xs text-muted-foreground">
                  {config.description}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {hasSelection && (
        <Button
          size="sm"
          variant="outline"
          onClick={onDeleteSelected}
          className="text-destructive bg-background/90 backdrop-blur-sm shadow-sm"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
      )}
    </div>
  );
}
