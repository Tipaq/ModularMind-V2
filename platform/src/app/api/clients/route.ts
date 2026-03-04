import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createClientSchema, parseBody } from "@/lib/validations";

// GET /api/clients — List all clients with engine count (add ?include=engines for full engine data)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await parseBody(req, createClientSchema);
  if (error) return error;

  const apiKey = `mmk_${crypto.randomBytes(24).toString("hex")}`;

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
