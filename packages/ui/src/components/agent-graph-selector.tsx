"use client";

import { useMemo, useState } from "react";
import { Bot, Plus, Search, Workflow, X } from "lucide-react";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./dropdown-menu";
import type { EngineAgent, EngineGraph } from "../types/engine";

interface AgentGraphSelectorProps {
  agents: EngineAgent[];
  graphs: EngineGraph[];
  enabledAgentIds: string[];
  enabledGraphIds: string[];
  onToggleAgent: (agentId: string) => void;
  onToggleGraph: (graphId: string) => void;
  isStreaming: boolean;
}

export function AgentGraphSelector({
  agents, graphs, enabledAgentIds, enabledGraphIds,
  onToggleAgent, onToggleGraph, isStreaming,
}: AgentGraphSelectorProps) {
  const [search, setSearch] = useState("");
  const activeCount = enabledAgentIds.length + enabledGraphIds.length;

  const filteredAgents = useMemo(() => {
    if (!search) return agents;
    const s = search.toLowerCase();
    return agents.filter((a) => a.name.toLowerCase().includes(s) || (a.description?.toLowerCase().includes(s) ?? false));
  }, [agents, search]);

  const filteredGraphs = useMemo(() => {
    if (!search) return graphs;
    const s = search.toLowerCase();
    return graphs.filter((g) => g.name.toLowerCase().includes(s) || (g.description?.toLowerCase().includes(s) ?? false));
  }, [graphs, search]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button" variant="ghost" size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground relative"
          disabled={isStreaming} title="Add agents or graphs"
        >
          <Plus className="h-4 w-4" />
          {activeCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-72" onCloseAutoFocus={() => setSearch("")}>
        <div className="flex items-center gap-2 px-2 pb-2 border-b">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text" placeholder="Search agents & graphs..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="max-h-[300px] overflow-y-auto overflow-x-hidden">
          {filteredAgents.length > 0 && (
            <>
              <DropdownMenuLabel className="flex items-center gap-1.5 text-xs">
                <Bot className="h-3.5 w-3.5" />
                Agents
                {enabledAgentIds.length > 0 && (
                  <span className="ml-auto text-[10px] font-normal text-primary">{enabledAgentIds.length} selected</span>
                )}
              </DropdownMenuLabel>
              {filteredAgents.map((agent) => (
                <DropdownMenuCheckboxItem
                  key={agent.id}
                  checked={enabledAgentIds.includes(agent.id)}
                  onCheckedChange={() => onToggleAgent(agent.id)}
                  onSelect={(e) => e.preventDefault()}
                  className="text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <span className="truncate">{agent.name}</span>
                    {agent.description && <p className="text-[10px] text-muted-foreground truncate">{agent.description}</p>}
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
            </>
          )}
          {filteredAgents.length > 0 && filteredGraphs.length > 0 && <DropdownMenuSeparator />}
          {filteredGraphs.length > 0 && (
            <>
              <DropdownMenuLabel className="flex items-center gap-1.5 text-xs">
                <Workflow className="h-3.5 w-3.5" />
                Graphs
                {enabledGraphIds.length > 0 && (
                  <span className="ml-auto text-[10px] font-normal text-primary">{enabledGraphIds.length} selected</span>
                )}
              </DropdownMenuLabel>
              {filteredGraphs.map((graph) => (
                <DropdownMenuCheckboxItem
                  key={graph.id}
                  checked={enabledGraphIds.includes(graph.id)}
                  onCheckedChange={() => onToggleGraph(graph.id)}
                  onSelect={(e) => e.preventDefault()}
                  className="text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <span className="truncate">{graph.name}</span>
                    {graph.description && <p className="text-[10px] text-muted-foreground truncate">{graph.description}</p>}
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
            </>
          )}
          {filteredAgents.length === 0 && filteredGraphs.length === 0 && (
            <div className="py-4 text-center text-xs text-muted-foreground">No results found</div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
