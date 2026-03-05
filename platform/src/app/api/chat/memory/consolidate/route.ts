import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { engineFetch } from "@/lib/engine-proxy";

// POST /api/chat/memory/consolidate — Trigger memory consolidation
export async function POST(): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const res = await engineFetch(
    "/api/v1/memory/admin/consolidation/trigger",
    { method: "POST" },
    session.user?.email ?? undefined,
  );
  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}
