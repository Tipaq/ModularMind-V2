import { create } from "zustand";
import type {
  ScheduledTask,
  ScheduledTaskListResponse,
  ScheduledTaskRun,
} from "@modularmind/api-client";
import { api } from "../lib/api";

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
  page: 1,
  totalPages: 1,
  total: 0,

  fetchTasks: async (page = 1, search = "") => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams({ page: String(page), page_size: "20" });
      if (search) params.set("search", search);
      const data = await api.get<ScheduledTaskListResponse>(
        `/scheduled-tasks?${params}`,
      );
      set({
        tasks: data.items,
        total: data.total,
        page: data.page,
        totalPages: data.total_pages,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch tasks" });
    } finally {
      set({ loading: false });
    }
  },

  fetchTask: async (id) => {
    set({ loading: true, error: null });
    try {
      const task = await api.get<ScheduledTask>(`/scheduled-tasks/${id}`);
      set({ selectedTask: task });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch task" });
    } finally {
      set({ loading: false });
    }
  },

  createTask: async (data) => {
    set({ error: null });
    try {
      const task = await api.post<ScheduledTask>("/scheduled-tasks", data);
      get().fetchTasks(get().page);
      return task;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to create task" });
      throw err;
    }
  },

  updateTask: async (id, data) => {
    set({ error: null });
    try {
      const task = await api.patch<ScheduledTask>(`/scheduled-tasks/${id}`, data);
      set({ selectedTask: task });
      get().fetchTasks(get().page);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to update task" });
      throw err;
    }
  },

  deleteTask: async (id) => {
    set({ error: null });
    try {
      await api.delete(`/scheduled-tasks/${id}`);
      get().fetchTasks(get().page);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to delete task" });
    }
  },

  duplicateTask: async (id) => {
    set({ error: null });
    try {
      await api.post(`/scheduled-tasks/${id}/duplicate`, {});
      get().fetchTasks(get().page);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to duplicate task" });
    }
  },

  toggleTask: async (id, enabled) => {
    set({ error: null });
    try {
      await api.patch<ScheduledTask>(`/scheduled-tasks/${id}`, { enabled });
      const selected = get().selectedTask;
      if (selected?.id === id) {
        set({ selectedTask: { ...selected, enabled } });
      }
      get().fetchTasks(get().page);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to toggle task" });
    }
  },

  triggerTask: async (id) => {
    set({ error: null });
    try {
      await api.post(`/scheduled-tasks/${id}/trigger`, {});
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to trigger task" });
    }
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
