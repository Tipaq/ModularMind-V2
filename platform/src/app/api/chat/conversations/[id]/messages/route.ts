import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { engineFetch } from "@/lib/engine-proxy";

// POST /api/chat/conversations/:id/messages — Send message
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const res = await engineFetch(`/api/v1/conversations/${id}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = await res.json();

  // Rewrite stream_url from Engine path to Platform proxy path
  if (data.stream_url && data.execution_id) {
    data.stream_url = `/api/chat/executions/${data.execution_id}/stream`;
  }

  return NextResponse.json(data, { status: res.status });
}
