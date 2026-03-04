import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { engineFetch } from "@/lib/engine-proxy";
import { parseBody, chatMessageSchema } from "@/lib/validations";

// POST /api/chat/conversations/:id/messages — Send message
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data, error } = await parseBody(req, chatMessageSchema);
  if (error) return error;

  const res = await engineFetch(
    `/api/v1/conversations/${id}/messages`,
    { method: "POST", body: JSON.stringify(data) },
    session.user?.email ?? undefined,
  );
  const responseData = await res.json();

  // Rewrite stream_url from Engine path to Platform proxy path
  if (responseData.stream_url && responseData.execution_id) {
    responseData.stream_url = `/api/chat/executions/${responseData.execution_id}/stream`;
  }

  return NextResponse.json(responseData, { status: res.status });
}
