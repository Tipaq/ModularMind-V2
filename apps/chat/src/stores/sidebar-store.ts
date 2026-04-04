import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarState {
  isCollapsed: boolean;
  expandedProjects: Set<string>;
  toggleCollapsed: () => void;
  toggleProject: (projectId: string) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isCollapsed: false,
      expandedProjects: new Set<string>(),
      toggleCollapsed: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
      toggleProject: (projectId: string) =>
        set((state) => {
          const next = new Set(state.expandedProjects);
          if (next.has(projectId)) next.delete(projectId);
          else next.add(projectId);
          return { expandedProjects: next };
        }),
    }),
    {
      name: "mm_sidebar",
      partialize: (state) => ({
        isCollapsed: state.isCollapsed,
        expandedProjects: Array.from(state.expandedProjects),
      }),
      merge: (persisted, current) => {
        const stored = persisted as { isCollapsed?: boolean; expandedProjects?: string[] };
        return {
          ...current,
          isCollapsed: stored?.isCollapsed ?? false,
          expandedProjects: new Set(stored?.expandedProjects ?? []),
        };
      },
    },
  ),
);
