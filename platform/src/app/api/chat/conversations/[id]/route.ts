import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { engineFetch } from "@/lib/engine-proxy";

// GET /api/chat/conversations/:id
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const res = await engineFetch(`/api/v1/conversations/${id}`);
  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}

// PATCH /api/chat/conversations/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const res = await engineFetch(`/api/v1/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}

// DELETE /api/chat/conversations/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const res = await engineFetch(`/api/v1/conversations/${id}`, {
    method: "DELETE",
  });

  if (res.status === 204) return new NextResponse(null, { status: 204 });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
