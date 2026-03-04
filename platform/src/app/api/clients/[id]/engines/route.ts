import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { createEngineSchema, parseBody } from "@/lib/validations";

const API_KEY_BYTES = 24;

// POST /api/clients/:id/engines — Create a new engine for a client
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const client = await db.client.findUnique({ where: { id } });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { data, error: bodyError } = await parseBody(req, createEngineSchema);
  if (bodyError) return bodyError;

  const apiKey = `mmk_${crypto.randomBytes(API_KEY_BYTES).toString("hex")}`;

  const engine = await db.engine.create({
    data: {
      name: data.name,
      url: data.url ?? "http://localhost:8000",
      apiKey,
      clientId: id,
    },
  });

  return NextResponse.json(engine, { status: 201 });
}
