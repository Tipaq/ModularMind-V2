import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { engineFetch } from "@/lib/engine-proxy";

const MAX_PAGE_SIZE = 200;

// GET /api/chat/config — Get agents, graphs, MCP servers from Engine
export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const email = session.user?.email ?? undefined;
  const [agentsRes, graphsRes, mcpRes] = await Promise.all([
    engineFetch(`/api/v1/agents?page=1&page_size=${MAX_PAGE_SIZE}`, {}, email),
    engineFetch(`/api/v1/graphs?page=1&page_size=${MAX_PAGE_SIZE}`, {}, email),
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
