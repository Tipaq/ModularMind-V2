import { NextRequest, NextResponse } from "next/server";
import { requireAuth, errorResponse } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { parseBody, updateClientSchema } from "@/lib/validations";

// GET /api/clients/:id
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const client = await db.client.findUnique({
    where: { id },
    include: { engines: true },
  });
  if (!client) return errorResponse("Not found", 404);

  return NextResponse.json(client);
}

// PATCH /api/clients/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const { data, error: bodyError } = await parseBody(req, updateClientSchema);
  if (bodyError) return bodyError;

  const client = await db.client.update({
    where: { id },
    data: { ...(data.name !== undefined && { name: data.name }) },
  });

  return NextResponse.json(client);
}

// DELETE /api/clients/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  // Cascade delete engines first
  await db.engine.deleteMany({ where: { clientId: id } });
  await db.client.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
