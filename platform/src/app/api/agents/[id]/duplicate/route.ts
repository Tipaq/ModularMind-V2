import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// POST /api/agents/:id/duplicate
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const original = await db.agent.findUnique({ where: { id } });
  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const copy = await db.agent.create({
    data: {
      name: `${original.name} (Copy)`,
      description: original.description,
      model: original.model,
      provider: original.provider,
      config: original.config ?? {},
      tags: original.tags,
    },
  });

  return NextResponse.json(copy, { status: 201 });
}
