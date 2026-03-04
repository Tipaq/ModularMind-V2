import { NextRequest, NextResponse } from "next/server";
import { requireAuth, errorResponse } from "@/lib/api-utils";
import { db } from "@/lib/db";

// POST /api/graphs/:id/duplicate
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const original = await db.graph.findUnique({ where: { id } });
  if (!original) return errorResponse("Not found", 404);

  const copy = await db.graph.create({
    data: {
      name: `${original.name} (Copy)`,
      description: original.description,
      nodes: original.nodes ?? [],
      edges: original.edges ?? [],
    },
  });

  return NextResponse.json(copy, { status: 201 });
}
