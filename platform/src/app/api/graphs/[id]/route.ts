import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAuth, errorResponse } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { parseBody, updateGraphSchema } from "@/lib/validations";

// GET /api/graphs/:id
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const graph = await db.graph.findUnique({ where: { id } });
  if (!graph) return errorResponse("Not found", 404);

  return NextResponse.json(graph);
}

// PATCH /api/graphs/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const { data, error: bodyError } = await parseBody(req, updateGraphSchema);
  if (bodyError) return bodyError;

  const graph = await db.graph.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.nodes !== undefined && { nodes: data.nodes as Prisma.InputJsonValue }),
      ...(data.edges !== undefined && { edges: data.edges as Prisma.InputJsonValue }),
      version: { increment: 1 },
    },
  });

  return NextResponse.json(graph);
}

// DELETE /api/graphs/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  await db.graph.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
