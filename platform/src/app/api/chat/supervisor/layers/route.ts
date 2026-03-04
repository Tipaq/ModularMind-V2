import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { engineFetch } from "@/lib/engine-proxy";

// GET /api/chat/supervisor/layers — Get supervisor layers from Engine
export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const res = await engineFetch("/api/v1/internal/supervisor/layers", {}, session.user?.email ?? undefined);
  if (!res.ok) {
    return NextResponse.json({ layers: [] }, { status: 200 });
  }
  const data = await res.json().catch(() => ({ layers: [] }));

  return NextResponse.json(data, { status: 200 });
}
