import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import crypto from "crypto";

// GET /api/clients — List all clients with engine count
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clients = await db.client.findMany({
    include: { _count: { select: { engines: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(clients);
}

// POST /api/clients — Create a new client (auto-generates first engine + API key)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const apiKey = `mmk_${crypto.randomBytes(24).toString("hex")}`;

  const client = await db.client.create({
    data: {
      name: body.name,
      engines: {
        create: {
          name: `${body.name} Engine`,
          url: body.engineUrl ?? "http://localhost:8000",
          apiKey,
        },
      },
    },
    include: { engines: true },
  });

  return NextResponse.json(client, { status: 201 });
}
