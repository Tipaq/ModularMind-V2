import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { engineFetch } from "@/lib/engine-proxy";

// POST /api/chat/compact — Compact conversation history via LLM
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const conversationId = body.conversation_id;
  if (!conversationId) {
    return NextResponse.json(
      { detail: "conversation_id required" },
      { status: 400 },
    );
  }

  const res = await engineFetch(
    `/api/v1/conversations/${conversationId}/compact`,
    { method: "POST" },
    session.user?.email ?? undefined,
  );
  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}
