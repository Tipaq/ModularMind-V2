import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAuth, errorResponse } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { parseBody, updateAgentSchema } from "@/lib/validations";

// GET /api/agents/:id
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const agent = await db.agent.findUnique({ where: { id } });
  if (!agent) return errorResponse("Not found", 404);

  return NextResponse.json(agent);
}

// PATCH /api/agents/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const { data, error: bodyError } = await parseBody(req, updateAgentSchema);
  if (bodyError) return bodyError;

  const agent = await db.agent.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.model !== undefined && { model: data.model }),
      ...(data.provider !== undefined && { provider: data.provider }),
      ...(data.config !== undefined && { config: data.config as Prisma.InputJsonValue }),
      ...(data.tags !== undefined && { tags: data.tags }),
      version: { increment: 1 },
    },
  });

  return NextResponse.json(agent);
}

// DELETE /api/agents/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  await db.agent.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
