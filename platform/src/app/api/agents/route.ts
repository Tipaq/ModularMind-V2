import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { paginatedQuery, paginatedResponse } from "@/lib/db-utils";
import { parseBody, createAgentSchema } from "@/lib/validations";

// GET /api/agents — List agents with pagination & search
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { items, total, page, pageSize } = await paginatedQuery(
    db.agent,
    req,
    ["name", "description"],
  );

  return paginatedResponse(items, total, page, pageSize);
}

// POST /api/agents — Create a new agent
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { data, error: bodyError } = await parseBody(req, createAgentSchema);
  if (bodyError) return bodyError;

  const agent = await db.agent.create({
    data: {
      name: data.name,
      description: data.description,
      model: data.model,
      provider: data.provider,
      config: data.config as Prisma.InputJsonValue,
      tags: data.tags,
    },
  });

  return NextResponse.json(agent, { status: 201 });
}
