import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { db } from "@/lib/db";

// GET /api/dashboard/stats — Aggregated platform stats
export async function GET(): Promise<NextResponse> {
  const { error } = await requireAuth();
  if (error) return error;

  const [clientCount, engineStatusCounts, agentCount, graphCount, recentEngines] =
    await Promise.all([
      db.client.count(),
      db.engine.groupBy({ by: ["status"], _count: true }),
      db.agent.count(),
      db.graph.count(),
      db.engine.findMany({
        take: 10,
        orderBy: { lastSeen: { sort: "desc", nulls: "last" } },
        include: { client: { select: { id: true, name: true } } },
      }),
    ]);

  const engineTotal = engineStatusCounts.reduce((sum, g) => sum + g._count, 0);
  const enginesByStatus: Record<string, number> = {};
  for (const group of engineStatusCounts) {
    enginesByStatus[group.status] = group._count;
  }

  return NextResponse.json({
    clients: clientCount,
    engines: {
      total: engineTotal,
      synced: enginesByStatus["synced"] ?? 0,
      registered: enginesByStatus["registered"] ?? 0,
      offline: enginesByStatus["offline"] ?? 0,
    },
    agents: agentCount,
    graphs: graphCount,
    recentEngines,
  });
}
