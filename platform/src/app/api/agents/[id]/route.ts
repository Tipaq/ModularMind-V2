import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseBody, updateAgentSchema } from "@/lib/validations";

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
  const { data, error } = await parseBody(req, updateAgentSchema);
  if (error) return error;

  const agent = await db.agent.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.model !== undefined && { model: data.model }),
      ...(data.provider !== undefined && { provider: data.provider }),
      ...(data.config !== undefined && { config: data.config }),
      ...(data.tags !== undefined && { tags: data.tags }),
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
