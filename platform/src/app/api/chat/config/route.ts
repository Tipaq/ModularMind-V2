import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { engineFetch } from "@/lib/engine-proxy";

// GET /api/chat/config — Get agents, graphs, MCP servers from Engine
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = session.user?.email ?? undefined;
  const [agentsRes, graphsRes, mcpRes] = await Promise.all([
    engineFetch("/api/v1/agents?page=1&page_size=200", {}, email),
    engineFetch("/api/v1/graphs?page=1&page_size=200", {}, email),
    engineFetch("/api/v1/mcp/servers", {}, email).catch(() => null),
  ]);

  const agentsData = await agentsRes.json().catch(() => ({ items: [] }));
  const graphsData = await graphsRes.json().catch(() => ({ items: [] }));
  const mcpData = mcpRes ? await mcpRes.json().catch(() => []) : [];

  return NextResponse.json({
    agents: agentsData.items || agentsData || [],
    graphs: graphsData.items || graphsData || [],
    mcpServers: Array.isArray(mcpData) ? mcpData : mcpData.items || [],
  });
}
