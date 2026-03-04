import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { engineFetch } from "@/lib/engine-proxy";
import { parseBody, chatMessageSchema } from "@/lib/validations";

// POST /api/chat/conversations/:id/messages — Send message
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const { data, error: bodyError } = await parseBody(req, chatMessageSchema);
  if (bodyError) return bodyError;

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
