import type {
  Agent,
  AgentDetail,
  AgentCreateInput,
  AgentUpdateInput,
} from "@modularmind/api-client";
import { createCrudStore } from "./create-crud-store";

const useStore = createCrudStore<Agent, AgentDetail, AgentCreateInput, AgentUpdateInput>(
  { basePath: "/agents", entityName: "agent" },
);

export const useAgentsStore = () => {
  const store = useStore();
  return {
    agents: store.items,
    selectedAgent: store.selectedItem,
    loading: store.loading,
    error: store.error,
    page: store.page,
    totalPages: store.totalPages,
    total: store.total,
    fetchAgents: store.fetchItems,
    fetchAgent: store.fetchItem,
    createAgent: store.createItem,
    updateAgent: store.updateItem,
    deleteAgent: store.deleteItem,
    duplicateAgent: store.duplicateItem,
    clearError: store.clearError,
  };
};
