import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// POST /api/graphs/:id/duplicate
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const original = await db.graph.findUnique({ where: { id } });
  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const copy = await db.graph.create({
    data: {
      name: `${original.name} (Copy)`,
      description: original.description,
      nodes: original.nodes ?? [],
      edges: original.edges ?? [],
    },
  });

  return NextResponse.json(copy, { status: 201 });
}
