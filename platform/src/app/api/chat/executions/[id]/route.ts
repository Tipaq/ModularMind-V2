import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { engineFetch } from "@/lib/engine-proxy";

// GET /api/chat/executions/:id — Get execution details
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const res = await engineFetch(`/api/v1/executions/${id}`);
  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}

// POST /api/chat/executions/:id — Stop execution
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const res = await engineFetch(`/api/v1/executions/${id}/stop`, {
    method: "POST",
  });
  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}
