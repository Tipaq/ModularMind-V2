import type { ReactNode } from "react";

export interface ResourceColumn<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  sortKey?: string;
  className?: string;
}

export interface ResourceFilterConfig {
  key: string;
  label: string;
  type: "search" | "select" | "sort";
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface PaginationState {
  page: number;
  totalPages: number;
  totalItems: number;
}

export interface SortState {
  key: string;
  direction: "asc" | "desc";
}
