import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/auth/register — Create first admin (only if no users exist)
export async function POST(req: NextRequest) {
  const userCount = await db.user.count();

  // Only allow registration if no users exist (first setup)
  // or if called by an authenticated admin (future: check session)
  if (userCount > 0) {
    return NextResponse.json(
      { error: "Registration is disabled. Contact an admin." },
      { status: 403 }
    );
  }

  const body = await req.json();

  if (!body.email || !body.name) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email: body.email } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const user = await db.user.create({
    data: {
      email: body.email,
      name: body.name,
      role: "owner", // First user is always owner
    },
  });

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
}
