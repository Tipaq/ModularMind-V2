import { NextRequest, NextResponse } from "next/server";

// GET /api/sync/manifest — Engine polls this endpoint
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("X-Engine-Key");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing X-Engine-Key" }, { status: 401 });
  }

  // TODO: Validate API key, compute manifest version
  // const engine = await db.engine.findUnique({ where: { apiKey } });
  // const agents = await db.agent.findMany({ where: { channel: 'stable' } });
  // const graphs = await db.graph.findMany({ where: { channel: 'stable' } });

  return NextResponse.json({
    version: 0,
    agent_count: 0,
    graph_count: 0,
  });
}
