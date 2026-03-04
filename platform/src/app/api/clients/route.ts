import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { createClientSchema, parseBody } from "@/lib/validations";

const API_KEY_BYTES = 24;

// GET /api/clients — List all clients with engine count (add ?include=engines for full engine data)
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const includeEngines = new URL(req.url).searchParams.get("include") === "engines";

  const clients = await db.client.findMany({
    include: includeEngines
      ? { engines: true, _count: { select: { engines: true } } }
      : { _count: { select: { engines: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(clients);
}

// POST /api/clients — Create a new client (auto-generates first engine + API key)
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { data, error: bodyError } = await parseBody(req, createClientSchema);
  if (bodyError) return bodyError;

  const apiKey = `mmk_${crypto.randomBytes(API_KEY_BYTES).toString("hex")}`;

  const client = await db.client.create({
    data: {
      name: data.name,
      engines: {
        create: {
          name: `${data.name} Engine`,
          url: data.engineUrl ?? "http://localhost:8000",
          apiKey,
        },
      },
    },
    include: { engines: true },
  });

  return NextResponse.json(client, { status: 201 });
}
