import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface DetailHeaderProps {
  backHref: string;
  backLabel: string;
  title: string;
  badges?: ReactNode;
  isEditing?: boolean;
  onEditTitle?: (value: string) => void;
  actions?: ReactNode;
}

export function DetailHeader({
  backHref,
  backLabel,
  title,
  badges,
  isEditing,
  onEditTitle,
  actions,
}: DetailHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-background shrink-0">
      <Link
        to={backHref}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors shrink-0"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      <div className="h-4 w-px bg-border shrink-0" />

      {isEditing && onEditTitle ? (
        <input
          type="text"
          value={title}
          onChange={(e) => onEditTitle(e.target.value)}
          className="text-lg font-semibold bg-transparent border-none outline-none focus:ring-0 px-1 min-w-0 flex-1 truncate hover:bg-muted/50 focus:bg-muted/50 rounded transition-colors"
          placeholder="Name"
        />
      ) : (
        <h1 className="text-lg font-semibold truncate">{title}</h1>
      )}

      {badges && <div className="flex items-center gap-2 shrink-0">{badges}</div>}

      <div className="ml-auto flex items-center gap-2 shrink-0">{actions}</div>
    </div>
  );
}
