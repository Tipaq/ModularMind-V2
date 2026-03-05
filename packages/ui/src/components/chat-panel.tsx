"use client";

import { memo, useRef, useCallback, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "./tabs";

export interface ChatPanelTab {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface ChatPanelProps {
  tabs: ChatPanelTab[];
  defaultTab?: string;
  children: React.ReactNode;
}

export const ChatPanel = memo(function ChatPanel({
  tabs,
  defaultTab,
  children,
}: ChatPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ active: false, startX: 0, scrollLeft: 0 });

  // Attach wheel listener with { passive: false } so preventDefault works
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY || e.deltaX;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Drag-to-scroll handlers
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = listRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    // Only start drag-scroll on left mouse / primary touch
    if (e.button !== 0) return;
    dragState.current = { active: true, startX: e.clientX, scrollLeft: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    const el = listRef.current;
    if (!el) return;
    const dx = e.clientX - dragState.current.startX;
    el.scrollLeft = dragState.current.scrollLeft - dx;
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    dragState.current.active = false;
    const el = listRef.current;
    if (el) {
      el.releasePointerCapture(e.pointerId);
      el.style.cursor = "";
    }
  }, []);

  return (
    <div className="w-[320px] shrink-0 border-l border-border/50 flex flex-col bg-card/30">
      <Tabs defaultValue={defaultTab ?? tabs[0]?.value} className="flex-1 flex flex-col min-h-0">
        <TabsList
          ref={listRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="h-14 w-full px-0 shrink-0"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="text-xs gap-1 px-2 h-full flex-1 justify-center select-none"
            >
              <tab.icon className="h-3 w-3" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>
      </Tabs>
    </div>
  );
});
