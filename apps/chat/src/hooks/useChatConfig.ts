import { useCallback, useRef, useState } from "react";
import { api } from "../lib/api";

export interface EngineAgent {
  id: string;
  name: string;
  description?: string;
  model_id?: string;
  system_prompt?: string;
  version?: number;
}

export interface EngineGraph {
  id: string;
  name: string;
  description?: string;
  node_count?: number;
  edge_count?: number;
  version?: number;
}

export interface EngineModel {
  id: string;
  name: string;
  provider: string;
  model_id: string;
  display_name: string | null;
  is_active: boolean;
  is_available: boolean;
  is_embedding: boolean;
}

export function useChatConfig() {
  const [agents, setAgents] = useState<EngineAgent[]>([]);
  const [graphs, setGraphs] = useState<EngineGraph[]>([]);
  const [models, setModels] = useState<EngineModel[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadedRef = useRef(false);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadedRef.current || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const [agentsRes, graphsRes, modelsRes] = await Promise.all([
        api.get<{ items: EngineAgent[] }>("/agents?page=1&page_size=200").catch(() => ({ items: [] })),
        api.get<{ items: EngineGraph[] }>("/graphs?page=1&page_size=200").catch(() => ({ items: [] })),
        api.get<EngineModel[]>("/models").catch(() => []),
      ]);

      setAgents(agentsRes.items || []);
      setGraphs(graphsRes.items || []);
      setModels(Array.isArray(modelsRes) ? modelsRes : []);

      loadedRef.current = true;
      setLoaded(true);
    } catch {
      // Silently fail — config is optional
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    loadedRef.current = false;
    loadingRef.current = true;
    setLoaded(false);
    setLoading(true);
    try {
      const [agentsRes, graphsRes, modelsRes] = await Promise.all([
        api.get<{ items: EngineAgent[] }>("/agents?page=1&page_size=200").catch(() => ({ items: [] })),
        api.get<{ items: EngineGraph[] }>("/graphs?page=1&page_size=200").catch(() => ({ items: [] })),
        api.get<EngineModel[]>("/models").catch(() => []),
      ]);

      setAgents(agentsRes.items || []);
      setGraphs(graphsRes.items || []);
      setModels(Array.isArray(modelsRes) ? modelsRes : []);

      loadedRef.current = true;
      setLoaded(true);
    } catch {
      // Silently fail
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  return {
    agents,
    graphs,
    models,
    loaded,
    loading,
    load,
    reload,
  };
}
