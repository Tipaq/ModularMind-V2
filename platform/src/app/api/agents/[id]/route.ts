import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/agents/:id
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const agent = await db.agent.findUnique({ where: { id } });
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(agent);
}

// PATCH /api/agents/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const agent = await db.agent.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.model !== undefined && { model: body.model }),
      ...(body.provider !== undefined && { provider: body.provider }),
      ...(body.config !== undefined && { config: body.config }),
      ...(body.tags !== undefined && { tags: body.tags }),
      version: { increment: 1 },
    },
  });

  return NextResponse.json(agent);
}

// DELETE /api/agents/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await db.agent.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
