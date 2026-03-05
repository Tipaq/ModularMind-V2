import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { paginatedQuery, paginatedResponse } from "@/lib/db-utils";
import { parseBody, createGraphSchema } from "@/lib/validations";

// GET /api/graphs — List graphs with pagination & search
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

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
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { data, error: bodyError } = await parseBody(req, createGraphSchema);
  if (bodyError) return bodyError;

  const graph = await db.graph.create({
    data: {
      name: data.name,
      description: data.description,
      nodes: data.nodes as Prisma.InputJsonValue,
      edges: data.edges as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json(graph, { status: 201 });
}
