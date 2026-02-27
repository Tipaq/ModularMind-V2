import { NextRequest, NextResponse } from "next/server";

// POST /api/engines/register — Engine registers itself on startup
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("X-Engine-Key");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing X-Engine-Key" }, { status: 401 });
  }

  // TODO: Validate API key, update engine record (lastSeen, status, url)
  // const body = await req.json();
  // await db.engine.update({
  //   where: { apiKey },
  //   data: { lastSeen: new Date(), status: "registered", url: body.url },
  // });

  return NextResponse.json({ ok: true });
}
