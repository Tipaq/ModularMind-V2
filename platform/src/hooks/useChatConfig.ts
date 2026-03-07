"use client";

import { useCallback, useRef, useState } from "react";
import type { EngineAgent, EngineGraph, EngineModel, McpServer, SupervisorLayer } from "@modularmind/ui";

export type { EngineAgent, EngineGraph, EngineModel, McpServer, SupervisorLayer } from "@modularmind/ui";

export function useChatConfig() {
  const [agents, setAgents] = useState<EngineAgent[]>([]);
  const [graphs, setGraphs] = useState<EngineGraph[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [models, setModels] = useState<EngineModel[]>([]);
  const [supervisorLayers, setSupervisorLayers] = useState<SupervisorLayer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  // Use refs for guard checks so `load` has a stable identity
  const loadedRef = useRef(false);
  const loadingRef = useRef(false);

  const _fetchConfig = useCallback(async () => {
    loadingRef.current = true;
    setLoading(true);
    try {
      const [configRes, modelsRes, layersRes] = await Promise.all([
        fetch("/api/chat/config"),
        fetch("/api/chat/models"),
        fetch("/api/chat/supervisor/layers"),
      ]);

      if (configRes.ok) {
        const data = await configRes.json();
        setAgents(Array.isArray(data.agents) ? data.agents : []);
        setGraphs(Array.isArray(data.graphs) ? data.graphs : []);
        setMcpServers(Array.isArray(data.mcpServers) ? data.mcpServers : []);
      }

      if (modelsRes.ok) {
        const data = await modelsRes.json();
        setModels(Array.isArray(data) ? data : []);
      }

      if (layersRes.ok) {
        const data = await layersRes.json();
        setSupervisorLayers(data.layers || []);
      }

      loadedRef.current = true;
      setLoaded(true);
    } catch {
      // Silently fail — config is optional
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (loadedRef.current || loadingRef.current) return;
    await _fetchConfig();
  }, [_fetchConfig]);

  const reload = useCallback(async () => {
    loadedRef.current = false;
    setLoaded(false);
    await _fetchConfig();
  }, [_fetchConfig]);

  const updateSupervisorLayer = useCallback(async (key: string, content: string) => {
    try {
      const res = await fetch(`/api/chat/supervisor/layers/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setSupervisorLayers((prev) =>
          prev.map((l) => (l.key === key ? { ...l, content } : l)),
        );
      }
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  return {
    agents,
    graphs,
    mcpServers,
    models,
    supervisorLayers,
    loaded,
    loading,
    load,
    reload,
    updateSupervisorLayer,
  };
}
