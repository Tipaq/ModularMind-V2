import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseBody, updateClientSchema } from "@/lib/validations";

// GET /api/clients/:id
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const client = await db.client.findUnique({
    where: { id },
    include: { engines: true },
  });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(client);
}

// PATCH /api/clients/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data, error } = await parseBody(req, updateClientSchema);
  if (error) return error;

  const client = await db.client.update({
    where: { id },
    data: { ...(data.name !== undefined && { name: data.name }) },
  });

  return NextResponse.json(client);
}

// DELETE /api/clients/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  // Cascade delete engines first
  await db.engine.deleteMany({ where: { clientId: id } });
  await db.client.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
