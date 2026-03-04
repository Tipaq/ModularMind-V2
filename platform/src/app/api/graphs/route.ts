import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { paginatedQuery, paginatedResponse } from "@/lib/db-utils";
import { parseBody, createGraphSchema } from "@/lib/validations";

// GET /api/graphs — List graphs with pagination & search
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { items: graphs, total, page, pageSize } = await paginatedQuery(
    db.graph,
    req,
    ["name", "description"],
  );

  const items = (graphs as { nodes: unknown; edges: unknown }[]).map((g) => ({
    ...g,
    node_count: Array.isArray(g.nodes) ? (g.nodes as unknown[]).length : 0,
    edge_count: Array.isArray(g.edges) ? (g.edges as unknown[]).length : 0,
  }));

  return paginatedResponse(items, total, page, pageSize);
}

// POST /api/graphs — Create a new graph
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await parseBody(req, createGraphSchema);
  if (error) return error;

  const graph = await db.graph.create({
    data: {
      name: data.name,
      description: data.description,
      nodes: data.nodes,
      edges: data.edges,
    },
  });

  return NextResponse.json(graph, { status: 201 });
}
