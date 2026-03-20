import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrEngineKey, errorResponse } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { createMiniApp } from "@/lib/mini-apps";
import { paginatedQuery, paginatedResponse } from "@/lib/db-utils";

// CORS headers configured in next.config.ts for /api/mini-apps/*

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const scope = req.nextUrl.searchParams.get("scope");
  const agentId = req.nextUrl.searchParams.get("agentId");

  const where: Record<string, unknown> = { isActive: true };
  if (scope) where.scope = scope;
  if (agentId) where.agentId = agentId;

  const { items, total, page, pageSize } = await paginatedQuery(
    db.miniApp,
    req,
    ["name", "description"],
    where,
  );

  return paginatedResponse(items, total, page, pageSize);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const body = await req.json();

  if (!body.name || !body.slug) {
    return errorResponse("name and slug are required", 400);
  }

  try {
    const app = await createMiniApp({
      name: body.name,
      slug: body.slug,
      description: body.description,
      scope: body.scope,
      allowedGroups: body.allowedGroups,
      ownerUserId: body.ownerUserId,
      agentId: body.agentId,
      initialHtml: body.html,
    });
    return NextResponse.json(app, { status: 201 });
  } catch (e) {
    return errorResponse(`Failed to create mini-app: ${e}`, 500);
  }
}
