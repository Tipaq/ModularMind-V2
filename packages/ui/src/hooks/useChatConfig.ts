"use client";

import { useCallback, useRef, useState } from "react";
import type { EngineAgent, EngineGraph, EngineModel, McpServer, SupervisorLayer } from "@modularmind/api-client";
import type { ChatConfigAdapter } from "./chat-config-adapter";

export function useChatConfig(adapter: ChatConfigAdapter) {
  const [agents, setAgents] = useState<EngineAgent[]>([]);
  const [graphs, setGraphs] = useState<EngineGraph[]>([]);
  const [models, setModels] = useState<EngineModel[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [supervisorLayers, setSupervisorLayers] = useState<SupervisorLayer[]>([]);
  const [userPreferences, setUserPreferences] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadedRef = useRef(false);
  const loadingRef = useRef(false);
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;

  const fetchConfig = useCallback(async () => {
    loadingRef.current = true;
    setLoading(true);
    try {
      const data = await adapterRef.current.fetchConfig();
      setAgents(data.agents);
      setGraphs(data.graphs);
      setModels(data.models);
      setMcpServers(data.mcpServers ?? []);
      setSupervisorLayers(data.supervisorLayers ?? []);
      setUserPreferences(data.userPreferences ?? null);

      loadedRef.current = true;
      setLoaded(true);
    } catch (err) {
      console.error("[useChatConfig] Failed to load config:", err);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (loadedRef.current || loadingRef.current) return;
    await fetchConfig();
  }, [fetchConfig]);

  const reload = useCallback(async () => {
    loadedRef.current = false;
    setLoaded(false);
    await fetchConfig();
  }, [fetchConfig]);

  const updateSupervisorLayer = useCallback(async (key: string, content: string) => {
    if (!adapterRef.current.updateSupervisorLayer) return false;
    const ok = await adapterRef.current.updateSupervisorLayer(key, content);
    if (ok) {
      setSupervisorLayers((prev) =>
        prev.map((l) => (l.key === key ? { ...l, content } : l)),
      );
    }
    return ok;
  }, []);

  const savePreferences = useCallback(async (prefs: string) => {
    if (!adapterRef.current.savePreferences) return;
    await adapterRef.current.savePreferences(prefs);
    setUserPreferences(prefs);
  }, []);

  return {
    agents,
    graphs,
    models,
    mcpServers,
    supervisorLayers,
    userPreferences,
    loaded,
    loading,
    load,
    reload,
    updateSupervisorLayer,
    savePreferences,
  };
}
