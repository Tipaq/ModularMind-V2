import { NextRequest, NextResponse } from "next/server";
import { requireAuth, errorResponse } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { parseBody, updateEngineSchema } from "@/lib/validations";

// GET /api/engines/:id
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const engine = await db.engine.findUnique({
    where: { id },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!engine) return errorResponse("Not found", 404);

  return NextResponse.json(engine);
}

// PATCH /api/engines/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const { data, error: bodyError } = await parseBody(req, updateEngineSchema);
  if (bodyError) return bodyError;

  const engine = await db.engine.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.url !== undefined && { url: data.url }),
    },
  });

  return NextResponse.json(engine);
}

// DELETE /api/engines/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  await db.engine.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
