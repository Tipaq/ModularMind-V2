import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { engineFetch } from "@/lib/engine-proxy";

// GET /api/chat/memory/stats — Get memory stats for the current user
export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const res = await engineFetch(
    "/api/v1/memory/me/stats",
    {},
    session.user?.email ?? undefined,
  );
  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}
