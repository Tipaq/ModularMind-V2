import type { PaginatedResponse } from "./common";

export type MiniAppScope = "GLOBAL" | "GROUP" | "PERSONAL";

export interface MiniApp {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string | null;
  entry_file: string;
  version: number;
  is_active: boolean;
  scope: MiniAppScope;
  allowed_groups: string[];
  owner_user_id: string | null;
  agent_id: string | null;
  created_at: string;
  updated_at: string;
  files?: MiniAppFile[];
}

export interface MiniAppFile {
  id: string;
  path: string;
  size_bytes: number;
  content_type: string;
  updated_at: string;
}

export interface MiniAppCreate {
  name: string;
  slug: string;
  description?: string;
  scope?: MiniAppScope;
  allowed_groups?: string[];
  owner_user_id?: string;
  agent_id?: string;
  initial_html?: string;
}

export interface MiniAppUpdate {
  name?: string;
  description?: string;
  icon?: string;
  is_active?: boolean;
  scope?: MiniAppScope;
  allowed_groups?: string[];
}

export interface StorageKey {
  key: string;
  updated_at: string;
}

export interface StorageValue {
  key: string;
  value: unknown;
  updated_at: string;
}

export interface MiniAppSnapshot {
  id: string;
  version: number;
  label: string | null;
  file_manifest: Array<{ path: string; size: number; contentType: string }>;
  created_at: string;
}

export type MiniAppListResponse = PaginatedResponse<MiniApp>;
