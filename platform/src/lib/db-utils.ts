import { NextRequest, NextResponse } from "next/server";

/** Default number of items per page when not specified by the client. */
export const DEFAULT_PAGE_SIZE = 20;

/** Maximum items allowed per page to prevent abuse. */
export const MAX_PAGE_SIZE = 100;

interface PrismaDelegate {
  findMany: (...args: any[]) => Promise<any[]>; // eslint-disable-line @typescript-eslint/no-explicit-any
  count: (...args: any[]) => Promise<number>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Run a paginated Prisma query with optional text search across specified fields.
 *
 * @param delegate  Prisma model delegate (e.g. `db.agent`, `db.graph`)
 * @param req       Incoming Next.js request (reads `page`, `page_size`, `search` from query params)
 * @param searchFields  Array of field names to search across (case-insensitive `contains`)
 * @returns Object with `{ items, total, page, pageSize, where }` shape
 */
export async function paginatedQuery<T>(
  delegate: PrismaDelegate,
  req: NextRequest,
  searchFields: string[] = ["name", "description"],
): Promise<{ items: T[]; total: number; page: number; pageSize: number; where: Record<string, unknown> }> {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get("page_size") || String(DEFAULT_PAGE_SIZE), 10)));
  const search = searchParams.get("search") || "";

  const where = search
    ? {
        OR: searchFields.map((field) => ({
          [field]: { contains: search, mode: "insensitive" as const },
        })),
      }
    : {};

  const [items, total] = await Promise.all([
    delegate.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    delegate.count({ where }),
  ]);

  return { items: items as T[], total, page, pageSize, where };
}

/** Build a standard paginated JSON response. */
export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): NextResponse {
  return NextResponse.json({
    items,
    total,
    page,
    total_pages: Math.ceil(total / pageSize) || 1,
  });
}
