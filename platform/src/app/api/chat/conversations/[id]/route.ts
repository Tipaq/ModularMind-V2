import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { engineFetch } from "@/lib/engine-proxy";
import { parseBody, conversationPatchSchema } from "@/lib/validations";

// GET /api/chat/conversations/:id
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const res = await engineFetch(`/api/v1/conversations/${id}`, {}, session.user?.email ?? undefined);
  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}

// PATCH /api/chat/conversations/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const { data, error: bodyError } = await parseBody(req, conversationPatchSchema);
  if (bodyError) return bodyError;

  const res = await engineFetch(
    `/api/v1/conversations/${id}`,
    { method: "PATCH", body: JSON.stringify(data) },
    session.user?.email ?? undefined,
  );
  const responseData = await res.json();

  return NextResponse.json(responseData, { status: res.status });
}

// DELETE /api/chat/conversations/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const res = await engineFetch(
    `/api/v1/conversations/${id}`,
    { method: "DELETE" },
    session.user?.email ?? undefined,
  );

  if (res.status === 204) return new NextResponse(null, { status: 204 });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
