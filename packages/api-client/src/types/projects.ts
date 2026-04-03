export type ProjectMemberRole = "owner" | "editor" | "viewer";

export interface ProjectMember {
  user_id: string;
  email: string;
  role: ProjectMemberRole;
  joined_at: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  owner_user_id: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string | null;
  member_count: number;
}

export interface ProjectDetail extends Project {
  members: ProjectMember[];
}

export interface ProjectCreate {
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  is_archived?: boolean;
}

export interface ProjectResourceCounts {
  conversations: number;
  collections: number;
  mini_apps: number;
  scheduled_tasks: number;
  repositories: number;
}

export type RepoIndexStatus = "pending" | "indexing" | "ready" | "failed";

export interface ProjectRepository {
  id: string;
  repo_identifier: string;
  repo_url: string | null;
  display_name: string | null;
  index_status: RepoIndexStatus;
  index_error: string | null;
  added_at: string;
  indexed_at: string | null;
}

export interface ProjectRepoAdd {
  repo_identifier: string;
  repo_url?: string;
  display_name?: string;
}
