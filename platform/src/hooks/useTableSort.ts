"use client";

import { useState, useMemo, useCallback, type Dispatch, type SetStateAction } from "react";
import type { SortState } from "@modularmind/ui";

interface UseTableSortReturn {
  filterValues: Record<string, string>;
  setFilterValues: Dispatch<SetStateAction<Record<string, string>>>;
  sortState: SortState | null;
  handleColumnSort: (sortKey: string) => void;
  handleFilterChange: (key: string, value: string) => void;
}

/**
 * Shared hook for table sorting and filtering across list pages.
 * Accepts an optional callback for side effects on filter changes (e.g. server-side refetch).
 */
export function useTableSort(
  onFilterChange?: (key: string, value: string) => void,
): UseTableSortReturn {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});

  const sortState = useMemo((): SortState | null => {
    const s = filterValues.sort;
    if (!s) return null;
    if (s.endsWith("_asc")) return { key: s.replace(/_asc$/, ""), direction: "asc" };
    if (s.endsWith("_desc")) return { key: s.replace(/_desc$/, ""), direction: "desc" };
    return { key: s, direction: "asc" };
  }, [filterValues.sort]);

  const handleColumnSort = useCallback((sortKey: string) => {
    setFilterValues((prev) => {
      const current = prev.sort || "";
      if (current === `${sortKey}_asc` || current === sortKey) {
        return { ...prev, sort: `${sortKey}_desc` };
      }
      if (current === `${sortKey}_desc`) {
        return { ...prev, sort: "" };
      }
      return { ...prev, sort: `${sortKey}_asc` };
    });
  }, []);

  const handleFilterChange = useCallback(
    (key: string, value: string) => {
      setFilterValues((prev) => ({ ...prev, [key]: value }));
      onFilterChange?.(key, value);
    },
    [onFilterChange],
  );

  return { filterValues, setFilterValues, sortState, handleColumnSort, handleFilterChange };
}
