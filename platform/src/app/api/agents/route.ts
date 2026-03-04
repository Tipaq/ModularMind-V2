import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { paginatedQuery, paginatedResponse } from "@/lib/db-utils";
import { parseBody, createAgentSchema } from "@/lib/validations";

// GET /api/agents — List agents with pagination & search
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { items, total, page, pageSize } = await paginatedQuery(
    db.agent,
    req,
    ["name", "description"],
  );

  return paginatedResponse(items, total, page, pageSize);
}

// POST /api/agents — Create a new agent
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await parseBody(req, createAgentSchema);
  if (error) return error;

  const agent = await db.agent.create({
    data: {
      name: data.name,
      description: data.description,
      model: data.model,
      provider: data.provider,
      config: data.config,
      tags: data.tags,
    },
  });

  return NextResponse.json(agent, { status: 201 });
}
