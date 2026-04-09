import { useKnowledgeCollectionsStore } from "./knowledge-collections";
import { useKnowledgeExplorerStore } from "./knowledge-explorer";
import { useKnowledgeStatsStore } from "./knowledge-stats";

export type {
  KnowledgeGlobalStats,
  ExplorerChunk,
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
  KnowledgeGraphData,
} from "./knowledge-types";

export { useKnowledgeCollectionsStore } from "./knowledge-collections";
export { useKnowledgeExplorerStore } from "./knowledge-explorer";
export { useKnowledgeStatsStore } from "./knowledge-stats";

type CombinedState = ReturnType<typeof useKnowledgeCollectionsStore.getState> &
  ReturnType<typeof useKnowledgeExplorerStore.getState> &
  ReturnType<typeof useKnowledgeStatsStore.getState>;

function getCombinedState(): CombinedState {
  return {
    ...useKnowledgeCollectionsStore.getState(),
    ...useKnowledgeExplorerStore.getState(),
    ...useKnowledgeStatsStore.getState(),
  };
}

export const useKnowledgeStore = Object.assign(
  <T = CombinedState>(selector?: (state: CombinedState) => T): T => {
    const collections = useKnowledgeCollectionsStore();
    const explorer = useKnowledgeExplorerStore();
    const stats = useKnowledgeStatsStore();
    const combined = { ...collections, ...explorer, ...stats };
    return selector ? selector(combined) : (combined as T);
  },
  { getState: getCombinedState },
);
