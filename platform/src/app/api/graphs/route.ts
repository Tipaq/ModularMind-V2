import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/graphs — List graphs with pagination & search
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

  const [graphs, total] = await Promise.all([
    db.graph.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.graph.count({ where }),
  ]);

  const items = graphs.map((g) => ({
    ...g,
    node_count: Array.isArray(g.nodes) ? (g.nodes as unknown[]).length : 0,
    edge_count: Array.isArray(g.edges) ? (g.edges as unknown[]).length : 0,
  }));

  return NextResponse.json({
    items,
    total,
    page,
    total_pages: Math.ceil(total / pageSize) || 1,
  });
}

// POST /api/graphs — Create a new graph
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const graph = await db.graph.create({
    data: {
      name: body.name,
      description: body.description ?? "",
      nodes: body.nodes ?? [],
      edges: body.edges ?? [],
    },
  });

  return NextResponse.json(graph, { status: 201 });
}
