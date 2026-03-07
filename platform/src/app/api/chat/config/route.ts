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

  const agentsData = agentsRes.ok ? await agentsRes.json().catch(() => ({ items: [] })) : { items: [] };
  const graphsData = graphsRes.ok ? await graphsRes.json().catch(() => ({ items: [] })) : { items: [] };
  const mcpData = mcpRes?.ok ? await mcpRes.json().catch(() => []) : [];

  const agents = Array.isArray(agentsData.items) ? agentsData.items : Array.isArray(agentsData) ? agentsData : [];
  const graphs = Array.isArray(graphsData.items) ? graphsData.items : Array.isArray(graphsData) ? graphsData : [];

  return NextResponse.json({
    agents,
    graphs,
    mcpServers: Array.isArray(mcpData) ? mcpData : Array.isArray(mcpData.items) ? mcpData.items : [],
  });
}
