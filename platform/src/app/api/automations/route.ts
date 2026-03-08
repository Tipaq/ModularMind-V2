import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAuthOrEngineKey } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { paginatedQuery, paginatedResponse } from "@/lib/db-utils";
import { parseBody, createAutomationSchema } from "@/lib/validations";

// GET /api/automations — List automations with pagination & search
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { items, total, page, pageSize } = await paginatedQuery(
    db.automation,
    req,
    ["name", "description"],
  );

  return paginatedResponse(items, total, page, pageSize);
}

// POST /api/automations — Create a new automation
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { data, error: bodyError } = await parseBody(req, createAutomationSchema);
  if (bodyError) return bodyError;

  const automation = await db.automation.create({
    data: {
      name: data.name,
      description: data.description,
      enabled: data.enabled,
      config: data.config as Prisma.InputJsonValue,
      tags: data.tags,
    },
  });

  return NextResponse.json(automation, { status: 201 });
}
