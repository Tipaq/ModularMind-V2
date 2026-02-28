import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const CHANNELS = ["dev", "beta", "stable"] as const;

// POST /api/graphs/:id/promote — Promote graph to next channel
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const targetChannel = body.channel as string;

  if (!CHANNELS.includes(targetChannel as (typeof CHANNELS)[number])) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }

  const graph = await db.graph.update({
    where: { id },
    data: { channel: targetChannel, version: { increment: 1 } },
  });

  return NextResponse.json(graph);
}
