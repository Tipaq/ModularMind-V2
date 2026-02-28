import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/agents — List all agents
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const agents = await db.agent.findMany({ orderBy: { updatedAt: "desc" } });
  return NextResponse.json(agents);
}

// POST /api/agents — Create a new agent
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const agent = await db.agent.create({
    data: {
      name: body.name,
      description: body.description ?? "",
      model: body.model,
      provider: body.provider,
      config: body.config ?? {},
      channel: body.channel ?? "dev",
      tags: body.tags ?? [],
    },
  });

  return NextResponse.json(agent, { status: 201 });
}
