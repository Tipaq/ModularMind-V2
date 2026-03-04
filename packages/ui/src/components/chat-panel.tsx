"use client";

import { memo } from "react";
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
  return (
    <div className="w-[320px] shrink-0 border-l border-border/50 flex flex-col bg-card/30">
      <Tabs defaultValue={defaultTab ?? tabs[0]?.value} className="flex-1 flex flex-col min-h-0">
        <TabsList className="flex h-14 w-full items-center justify-start rounded-none border-none border-b bg-transparent px-3 shrink-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="text-xs gap-1 shrink-0 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-3 h-full"
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
