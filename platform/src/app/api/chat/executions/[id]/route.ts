import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { engineFetch } from "@/lib/engine-proxy";

// GET /api/chat/executions/:id — Get execution details
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const res = await engineFetch(`/api/v1/executions/${id}`, {}, session.user?.email ?? undefined);
  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}

// POST /api/chat/executions/:id — Stop execution
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const res = await engineFetch(
    `/api/v1/executions/${id}/stop`,
    { method: "POST" },
    session.user?.email ?? undefined,
  );
  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}
