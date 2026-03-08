import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAuthOrEngineKey, errorResponse } from "@/lib/api-utils";
import { db } from "@/lib/db";

// POST /api/automations/:id/duplicate — Duplicate an automation
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id } = await params;
  const source = await db.automation.findUnique({ where: { id } });
  if (!source) return errorResponse("Not found", 404);

  const duplicate = await db.automation.create({
    data: {
      name: `${source.name} (copy)`,
      description: source.description,
      enabled: false,
      config: source.config as Prisma.InputJsonValue,
      tags: source.tags,
    },
  });

  return NextResponse.json(duplicate, { status: 201 });
}
