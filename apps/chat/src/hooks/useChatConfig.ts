import { useCallback, useRef, useState } from "react";
import { api } from "../lib/api";
import type { EngineAgent, EngineGraph, EngineModel } from "@modularmind/api-client";

export type { EngineAgent, EngineGraph, EngineModel } from "@modularmind/api-client";

export function useChatConfig() {
  const [agents, setAgents] = useState<EngineAgent[]>([]);
  const [graphs, setGraphs] = useState<EngineGraph[]>([]);
  const [models, setModels] = useState<EngineModel[]>([]);
  const [userPreferences, setUserPreferences] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadedRef = useRef(false);
  const loadingRef = useRef(false);

  const _fetchConfig = useCallback(async () => {
    loadingRef.current = true;
    setLoading(true);
    try {
      const [agentsRes, graphsRes, modelsRes, prefsRes] = await Promise.all([
        api.get<{ items: EngineAgent[] }>("/agents?page=1&page_size=200").catch(() => ({ items: [] })),
        api.get<{ items: EngineGraph[] }>("/graphs?page=1&page_size=200").catch(() => ({ items: [] })),
        api.get<EngineModel[]>("/models").catch(() => []),
        api.get<{ preferences: string | null }>("/auth/me/preferences").catch(() => ({ preferences: null })),
      ]);

      setAgents(Array.isArray(agentsRes.items) ? agentsRes.items : []);
      setGraphs(Array.isArray(graphsRes.items) ? graphsRes.items : []);
      setModels(Array.isArray(modelsRes) ? modelsRes : []);
      setUserPreferences(prefsRes.preferences ?? null);

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
    await _fetchConfig();
  }, [_fetchConfig]);

  const reload = useCallback(async () => {
    loadedRef.current = false;
    setLoaded(false);
    await _fetchConfig();
  }, [_fetchConfig]);

  const savePreferences = useCallback(async (prefs: string) => {
    await api.patch("/auth/me/preferences", { preferences: prefs });
    setUserPreferences(prefs);
  }, []);

  return {
    agents,
    graphs,
    models,
    userPreferences,
    loaded,
    loading,
    load,
    reload,
    savePreferences,
  };
}
