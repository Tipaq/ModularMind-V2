import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { engineFetch } from "@/lib/engine-proxy";

// GET /api/chat/models — List all models from Engine
export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const res = await engineFetch("/api/v1/models", {}, session.user?.email ?? undefined);
  const data = await res.json().catch(() => []);

  return NextResponse.json(data, { status: res.status });
}
