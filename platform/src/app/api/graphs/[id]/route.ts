import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/graphs/:id
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const graph = await db.graph.findUnique({ where: { id } });
  if (!graph) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(graph);
}

// PATCH /api/graphs/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const graph = await db.graph.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.nodes !== undefined && { nodes: body.nodes }),
      ...(body.edges !== undefined && { edges: body.edges }),
      version: { increment: 1 },
    },
  });

  return NextResponse.json(graph);
}

// DELETE /api/graphs/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await db.graph.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
