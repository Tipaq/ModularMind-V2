"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

const BACK_LINK_CLASS =
  "flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors shrink-0";

export interface DetailHeaderProps {
  backHref: string;
  backLabel: string;
  /**
   * Custom link renderer for framework-specific navigation.
   * Receives `href`, `className`, and `children`.
   * Defaults to a plain `<a>` tag.
   */
  renderLink?: (props: { href: string; className: string; children: ReactNode }) => ReactNode;
  title: string;
  badges?: ReactNode;
  isEditing?: boolean;
  onEditTitle?: (value: string) => void;
  actions?: ReactNode;
}

export function DetailHeader({
  backHref,
  backLabel,
  renderLink,
  title,
  badges,
  isEditing,
  onEditTitle,
  actions,
}: DetailHeaderProps) {
  const linkChildren = (
    <>
      <ArrowLeft className="h-4 w-4" />
      {backLabel}
    </>
  );

  const backLink = renderLink
    ? renderLink({ href: backHref, className: BACK_LINK_CLASS, children: linkChildren })
    : <a href={backHref} className={BACK_LINK_CLASS}>{linkChildren}</a>;

  return (
    <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-background shrink-0">
      {backLink}

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
