import { NextRequest, NextResponse } from "next/server";
import { validateEngineKey } from "@/lib/engine-auth";
import { db } from "@/lib/db";

// GET /api/sync/manifest — Engine polls for config updates
export async function GET(req: NextRequest) {
  const { engine, error } = await validateEngineKey(req);
  if (error) return error;

  // Update lastSeen on every poll
  await db.engine.update({
    where: { id: engine.id },
    data: { lastSeen: new Date(), status: "synced" },
  });

  const agents = await db.agent.findMany({
    where: { channel: "stable" },
    orderBy: { updatedAt: "desc" },
  });

  const graphs = await db.graph.findMany({
    where: { channel: "stable" },
    orderBy: { updatedAt: "desc" },
  });

  // Compute version as max of all updatedAt timestamps
  const timestamps = [
    ...agents.map((a) => a.updatedAt.getTime()),
    ...graphs.map((g) => g.updatedAt.getTime()),
  ];
  const version = timestamps.length > 0 ? Math.max(...timestamps) : 0;

  return NextResponse.json({
    version,
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      model: a.model,
      provider: a.provider,
      config: a.config,
      version: a.version,
      tags: a.tags,
    })),
    graphs: graphs.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      nodes: g.nodes,
      edges: g.edges,
      version: g.version,
    })),
    agent_count: agents.length,
    graph_count: graphs.length,
  });
}
