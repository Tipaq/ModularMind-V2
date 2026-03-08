import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAuthOrEngineKey, errorResponse } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { parseBody, updateAutomationSchema } from "@/lib/validations";

// GET /api/automations/:id
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id } = await params;
  const automation = await db.automation.findUnique({ where: { id } });
  if (!automation) return errorResponse("Not found", 404);

  return NextResponse.json(automation);
}

// PATCH /api/automations/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id } = await params;
  const { data, error: bodyError } = await parseBody(req, updateAutomationSchema);
  if (bodyError) return bodyError;

  const automation = await db.automation.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.enabled !== undefined && { enabled: data.enabled }),
      ...(data.config !== undefined && { config: data.config as Prisma.InputJsonValue }),
      ...(data.tags !== undefined && { tags: data.tags }),
      version: { increment: 1 },
    },
  });

  return NextResponse.json(automation);
}

// DELETE /api/automations/:id
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id } = await params;
  await db.automation.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
