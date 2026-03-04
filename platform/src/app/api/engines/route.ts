import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { paginatedResponse, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/db-utils";

// GET /api/engines — Paginated engine list with client info
// Supports ?status=synced to filter by status
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get("page_size") || String(DEFAULT_PAGE_SIZE), 10)),
  );

  const where: Record<string, unknown> = {};

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" as const } },
    ];
  }

  const [engines, total] = await Promise.all([
    db.engine.findMany({
      where,
      include: { client: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.engine.count({ where }),
  ]);

  return paginatedResponse(engines, total, page, pageSize);
}
