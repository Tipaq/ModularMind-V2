import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { engineFetch } from "@/lib/engine-proxy";

// POST /api/chat/executions/:id/reject — Reject an execution approval gate
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const res = await engineFetch(
    `/api/v1/executions/${id}/reject`,
    { method: "POST" },
    session.user?.email ?? undefined,
  );
  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}
