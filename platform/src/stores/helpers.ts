"use client";

import { DEFAULT_PAGE_SIZE } from "@/lib/db-utils";

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  total_pages: number;
}

type SetPartial = (partial: Record<string, unknown>) => void;

/**
 * Perform a paginated GET and update store pagination state.
 * Returns the items array so the caller can assign it to the right field name.
 */
export async function paginatedFetch<T>(
  endpoint: string,
  page: number,
  search: string,
  resourceName: string,
  set: SetPartial,
  extraParams?: Record<string, string>,
): Promise<T[]> {
  set({ loading: true, error: null });
  try {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(DEFAULT_PAGE_SIZE),
    });
    if (search) params.set("search", search);
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) {
        if (v) params.set(k, v);
      }
    }
    const res = await fetch(`${endpoint}?${params}`);
    if (!res.ok) throw new Error(`Failed to load ${resourceName}`);
    const data: PaginatedResponse<T> = await res.json();
    set({
      total: data.total,
      page: data.page,
      totalPages: data.total_pages,
      loading: false,
    });
    return data.items;
  } catch (err) {
    set({
      error: err instanceof Error ? err.message : `Failed to load ${resourceName}`,
      loading: false,
    });
    return [];
  }
}

/**
 * Perform a mutating fetch (POST/PATCH/DELETE) with standard error handling.
 */
export async function mutatingFetch<T = void>(
  url: string,
  method: string,
  actionLabel: string,
  set: SetPartial,
  body?: unknown,
): Promise<T> {
  set({ error: null });
  try {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`Failed to ${actionLabel}`);
    if (res.status === 204) return undefined as T;
    return await res.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : `Failed to ${actionLabel}`;
    set({ error: message });
    throw err;
  }
}

/**
 * Perform a single-item GET and update loading/error state.
 */
export async function fetchOne<T>(
  url: string,
  resourceName: string,
  set: SetPartial,
): Promise<T> {
  set({ loading: true, error: null });
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${resourceName}`);
    const item: T = await res.json();
    set({ loading: false });
    return item;
  } catch (err) {
    set({
      error: err instanceof Error ? err.message : `Failed to load ${resourceName}`,
      loading: false,
    });
    throw err;
  }
}
