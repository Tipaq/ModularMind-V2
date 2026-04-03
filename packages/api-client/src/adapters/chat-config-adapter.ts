import type {
  EngineAgent,
  EngineGraph,
  EngineModel,
  SupervisorLayer,
} from "../types/engine";
import { api } from "../index";

export interface ChatConfigData {
  agents: EngineAgent[];
  graphs: EngineGraph[];
  models: EngineModel[];
  supervisorLayers?: SupervisorLayer[];
  userPreferences?: string | null;
}

export interface ChatConfigAdapter {
  fetchConfig(): Promise<ChatConfigData>;
  updateSupervisorLayer?(key: string, content: string): Promise<boolean>;
  savePreferences?(prefs: string): Promise<void>;
}

interface ChatConfigAdapterOptions {
  includeUserPreferences?: boolean;
  includeSupervisorWrite?: boolean;
}

export function createChatConfigAdapter(
  options?: ChatConfigAdapterOptions,
): ChatConfigAdapter {
  const includePrefs = options?.includeUserPreferences ?? false;
  const includeWrite = options?.includeSupervisorWrite ?? false;

  const adapter: ChatConfigAdapter = {
    async fetchConfig() {
      const promises: Promise<unknown>[] = [
        api
          .get<{ items: EngineAgent[] }>("/agents?page=1&page_size=200")
          .catch(() => ({ items: [] as EngineAgent[] })),
        api
          .get<{ items: EngineGraph[] }>("/graphs?page=1&page_size=200")
          .catch(() => ({ items: [] as EngineGraph[] })),
        api.get<EngineModel[]>("/models").catch(() => [] as EngineModel[]),
        api
          .get<{ layers: SupervisorLayer[] }>("/internal/supervisor/layers")
          .catch(() => ({ layers: [] as SupervisorLayer[] })),
      ];

      if (includePrefs) {
        promises.push(
          api
            .get<{ preferences: string | null }>("/auth/me/preferences")
            .catch(() => ({ preferences: null })),
        );
      }

      const results = await Promise.all(promises);

      const agentsRes = results[0] as { items: EngineAgent[] };
      const graphsRes = results[1] as { items: EngineGraph[] };
      const modelsRes = results[2] as EngineModel[];
      const layersRes = results[3] as { layers: SupervisorLayer[] };
      const prefsRes = includePrefs
        ? (results[4] as { preferences: string | null })
        : { preferences: null };

      return {
        agents: Array.isArray(agentsRes.items) ? agentsRes.items : [],
        graphs: Array.isArray(graphsRes.items) ? graphsRes.items : [],
        models: Array.isArray(modelsRes) ? modelsRes : [],
        supervisorLayers: Array.isArray(layersRes.layers)
          ? layersRes.layers
          : [],
        userPreferences: prefsRes.preferences ?? null,
      };
    },
  };

  if (includeWrite) {
    adapter.updateSupervisorLayer = async (key, content) => {
      try {
        await api.patch(`/internal/supervisor/layers/${key}`, { content });
        return true;
      } catch {
        return false;
      }
    };

    adapter.savePreferences = async (prefs) => {
      await api.patch("/auth/me/preferences", { preferences: prefs });
    };
  }

  return adapter;
}

export const chatConfigAdapter: ChatConfigAdapter = createChatConfigAdapter();
