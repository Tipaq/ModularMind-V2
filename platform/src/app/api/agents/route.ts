import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/agents — List agents with pagination & search
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("page_size") || "20", 10)));
  const search = searchParams.get("search") || "";

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [agents, total] = await Promise.all([
    db.agent.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.agent.count({ where }),
  ]);

  return NextResponse.json({
    items: agents,
    total,
    page,
    total_pages: Math.ceil(total / pageSize) || 1,
  });
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
      tags: body.tags ?? [],
    },
  });

  return NextResponse.json(agent, { status: 201 });
}
