import { NextRequest, NextResponse } from "next/server";
import { requireAuth, errorResponse } from "@/lib/api-utils";
import { db } from "@/lib/db";

// POST /api/agents/:id/duplicate
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const original = await db.agent.findUnique({ where: { id } });
  if (!original) return errorResponse("Not found", 404);

  const copy = await db.agent.create({
    data: {
      name: `${original.name} (Copy)`,
      description: original.description,
      model: original.model,
      provider: original.provider,
      config: original.config ?? {},
      tags: original.tags,
    },
  });

  return NextResponse.json(copy, { status: 201 });
}
