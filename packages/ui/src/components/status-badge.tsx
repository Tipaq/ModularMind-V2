import { cn } from "../lib/utils";
import { CHANNEL_COLORS, STATUS_COLORS, ROLE_COLORS } from "../lib/colors";

type BadgeType = "channel" | "status" | "role";

const COLOR_MAPS: Record<BadgeType, Record<string, string>> = {
  channel: CHANNEL_COLORS,
  status: STATUS_COLORS,
  role: ROLE_COLORS,
};

interface StatusBadgeProps {
  type: BadgeType;
  value: string;
  className?: string;
}

export function StatusBadge({ type, value, className }: StatusBadgeProps) {
  const colors = COLOR_MAPS[type][value] ?? "bg-muted text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        colors,
        className,
      )}
    >
      {value}
    </span>
  );
}

/** Convenience component for release channel badges */
export function ChannelBadge({
  channel,
  className,
}: {
  channel: string;
  className?: string;
}) {
  return <StatusBadge type="channel" value={channel} className={className} />;
}
