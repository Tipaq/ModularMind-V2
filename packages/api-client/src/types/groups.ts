// ─── Request ────────────────────────────────────────────────────────────────

export interface GroupCreate {
  name: string;
  slug?: string;
  description?: string;
}

export interface GroupUpdate {
  name?: string;
  description?: string;
  is_active?: boolean;
}

export interface MemberAdd {
  user_id: string;
  role?: string;
}

// ─── Response ───────────────────────────────────────────────────────────────

export interface Member {
  user_id: string;
  email: string;
  role: string;
  joined_at: string;
}

export interface Group {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  member_count: number;
}

export interface GroupDetail extends Group {
  members: Member[];
}
