import { Bot, Zap, Code2, PanelRight } from "lucide-react";
import type { TokenUsage } from "@modularmind/ui";

type RightPanel = "insights" | "artifacts" | null;

interface ChatHeaderProps {
  title: string;
  runningActivityLabel: string | null;
  latestTokenUsage: TokenUsage | null;
  rightPanel: RightPanel;
  onTogglePanel: (panel: "insights" | "artifacts") => void;
}

export function ChatHeader({
  title, runningActivityLabel, latestTokenUsage, rightPanel, onTogglePanel,
}: ChatHeaderProps) {
  return (
    <div className="h-14 border-b flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{title}</p>
          {runningActivityLabel && (
            <p className="text-xs text-muted-foreground truncate">{runningActivityLabel}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {latestTokenUsage && (
          <span className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground">
            <Zap className="h-3 w-3" />
            {latestTokenUsage.total}
          </span>
        )}
        <PanelToggle
          isActive={rightPanel === "artifacts"}
          onClick={() => onTogglePanel("artifacts")}
          title="Toggle artifacts panel"
          icon={<Code2 className="h-4 w-4" />}
        />
        <PanelToggle
          isActive={rightPanel === "insights"}
          onClick={() => onTogglePanel("insights")}
          title="Toggle insights panel"
          icon={<PanelRight className="h-4 w-4" />}
        />
      </div>
    </div>
  );
}

interface PanelToggleProps {
  isActive: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
}

function PanelToggle({ isActive, onClick, title, icon }: PanelToggleProps) {
  return (
    <button
      onClick={onClick}
      className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${
        isActive
          ? "text-primary bg-primary/10"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
      title={title}
    >
      {icon}
    </button>
  );
}
