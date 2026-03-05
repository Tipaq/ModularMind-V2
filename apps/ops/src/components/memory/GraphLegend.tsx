import { Separator } from "@modularmind/ui";
import type { MemoryUser } from "../../stores/memory";

const USER_ID_DISPLAY_LENGTH = 8;

interface GraphLegendProps {
  userColorMap: Record<string, string>;
  memoryUsers: MemoryUser[];
}

export function GraphLegend({ userColorMap, memoryUsers }: GraphLegendProps) {
  return (
    <div className="absolute bottom-3 left-3 flex flex-col gap-1.5 bg-card/80 backdrop-blur-sm rounded-md px-3 py-2 border text-xs text-muted-foreground">
      {/* Types — shape only, color encodes user */}
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-muted-foreground/50" />
        <span>Episodic</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 bg-muted-foreground/50" />
        <span>Semantic</span>
      </div>
      <div className="flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0 text-muted-foreground/50">
          <polygon points="5,0 10,10 0,10" fill="currentColor" />
        </svg>
        <span>Procedural</span>
      </div>
      {Object.keys(userColorMap).length > 0 && (
        <>
          <Separator className="my-0" />
          {Object.entries(userColorMap).map(([userId, color]) => {
            const u = memoryUsers.find(m => m.user_id === userId);
            return (
              <div key={userId} className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
                  <polygon points="6,1 10.2,3.5 10.2,8.5 6,11 1.8,8.5 1.8,3.5" fill={color} />
                </svg>
                <span className="truncate max-w-[110px]">
                  {u?.email ?? `${userId.slice(0, USER_ID_DISPLAY_LENGTH)}…`}
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
