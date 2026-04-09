import type {
  GraphListItem,
  Graph,
  GraphCreateInput,
  GraphUpdateInput,
} from "@modularmind/api-client";
import { createCrudStore } from "./create-crud-store";

const useStore = createCrudStore<GraphListItem, Graph, GraphCreateInput, GraphUpdateInput>(
  { basePath: "/graphs", entityName: "graph" },
);

export const useGraphsStore = () => {
  const store = useStore();
  return {
    graphs: store.items,
    selectedGraph: store.selectedItem,
    loading: store.loading,
    error: store.error,
    page: store.page,
    totalPages: store.totalPages,
    total: store.total,
    fetchGraphs: store.fetchItems,
    fetchGraph: store.fetchItem,
    createGraph: store.createItem,
    updateGraph: store.updateItem,
    deleteGraph: store.deleteItem,
    duplicateGraph: store.duplicateItem,
    clearError: store.clearError,
  };
};
