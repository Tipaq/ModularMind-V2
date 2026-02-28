import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/graphs — List all graphs
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const graphs = await db.graph.findMany({ orderBy: { updatedAt: "desc" } });
  return NextResponse.json(graphs);
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
