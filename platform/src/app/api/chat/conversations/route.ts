import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { engineFetch } from "@/lib/engine-proxy";
import { parseBody, chatMessageSchema } from "@/lib/validations";

// GET /api/chat/conversations — List conversations
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = req.nextUrl;
  const qs = searchParams.toString();
  const path = `/api/v1/conversations${qs ? `?${qs}` : ""}`;

  const res = await engineFetch(path, {}, session.user?.email ?? undefined);
  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}

// POST /api/chat/conversations — Create conversation
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { data, error: bodyError } = await parseBody(req, chatMessageSchema);
  if (bodyError) return bodyError;

  const res = await engineFetch(
    "/api/v1/conversations",
    { method: "POST", body: JSON.stringify(data) },
    session.user?.email ?? undefined,
  );
  const responseData = await res.json();

  return NextResponse.json(responseData, { status: res.status });
}
