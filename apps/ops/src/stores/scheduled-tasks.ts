import { create } from "zustand";
import type {
  ScheduledTask,
  ScheduledTaskListResponse,
  ScheduledTaskRun,
} from "@modularmind/api-client";
import { api } from "@modularmind/api-client";
import { createPaginatedState, withLoading, withError, withErrorRethrow } from "./store-helpers";

interface ScheduledTasksState {
  tasks: ScheduledTask[];
  selectedTask: ScheduledTask | null;
  taskRuns: ScheduledTaskRun[];
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  total: number;

  fetchTasks: (page?: number, search?: string) => Promise<void>;
  fetchTask: (id: string) => Promise<void>;
  createTask: (data: Partial<ScheduledTask> & { name: string }) => Promise<ScheduledTask>;
  updateTask: (id: string, data: Partial<ScheduledTask>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  duplicateTask: (id: string) => Promise<void>;
  toggleTask: (id: string, enabled: boolean) => Promise<void>;
  triggerTask: (id: string) => Promise<void>;
  fetchTaskRuns: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useScheduledTasksStore = create<ScheduledTasksState>((set, get) => ({
  tasks: [],
  selectedTask: null,
  taskRuns: [],
  loading: false,
  error: null,
  ...createPaginatedState(),

  fetchTasks: async (page = 1, search = "") => {
    await withLoading(set, async () => {
      const params = new URLSearchParams({ page: String(page), page_size: "20" });
      if (search) params.set("search", search);
      const data = await api.get<ScheduledTaskListResponse>(
        `/scheduled-tasks/?${params}`,
      );
      set({
        tasks: data.items,
        total: data.total,
        page: data.page,
        totalPages: data.total_pages,
      });
    }, "Failed to fetch tasks");
  },

  fetchTask: async (id) => {
    await withLoading(set, async () => {
      const task = await api.get<ScheduledTask>(`/scheduled-tasks/${id}`);
      set({ selectedTask: task });
    }, "Failed to fetch task");
  },

  createTask: async (data) => {
    return withErrorRethrow(set, async () => {
      const task = await api.post<ScheduledTask>("/scheduled-tasks/", data);
      get().fetchTasks(get().page);
      return task;
    }, "Failed to create task");
  },

  updateTask: async (id, data) => {
    await withErrorRethrow(set, async () => {
      const task = await api.patch<ScheduledTask>(`/scheduled-tasks/${id}`, data);
      set({ selectedTask: task });
      get().fetchTasks(get().page);
    }, "Failed to update task");
  },

  deleteTask: async (id) => {
    await withError(set, async () => {
      await api.delete(`/scheduled-tasks/${id}`);
      get().fetchTasks(get().page);
    }, "Failed to delete task");
  },

  duplicateTask: async (id) => {
    await withError(set, async () => {
      await api.post(`/scheduled-tasks/${id}/duplicate`, {});
      get().fetchTasks(get().page);
    }, "Failed to duplicate task");
  },

  toggleTask: async (id, enabled) => {
    await withError(set, async () => {
      await api.patch<ScheduledTask>(`/scheduled-tasks/${id}`, { enabled });
      const selected = get().selectedTask;
      if (selected?.id === id) {
        set({ selectedTask: { ...selected, enabled } });
      }
      get().fetchTasks(get().page);
    }, "Failed to toggle task");
  },

  triggerTask: async (id) => {
    await withError(set, async () => {
      await api.post(`/scheduled-tasks/${id}/trigger`, {});
    }, "Failed to trigger task");
  },

  fetchTaskRuns: async (id) => {
    try {
      const runs = await api.get<ScheduledTaskRun[]>(
        `/scheduled-tasks/${id}/runs?limit=50`,
      );
      set({ taskRuns: runs });
    } catch {
      set({ taskRuns: [] });
    }
  },

  clearError: () => set({ error: null }),
}));
