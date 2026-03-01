import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { engineFetch } from "@/lib/engine-proxy";

// GET /api/chat/models — List all models from Engine
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await engineFetch("/api/v1/models");
  const data = await res.json().catch(() => []);

  return NextResponse.json(data, { status: res.status });
}
