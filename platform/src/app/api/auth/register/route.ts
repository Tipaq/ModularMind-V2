import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseBody, registerSchema } from "@/lib/validations";

const BCRYPT_ROUNDS = 12;

// POST /api/auth/register — Create first admin (only if no users exist)
export async function POST(req: NextRequest): Promise<NextResponse> {
  const userCount = await db.user.count();

  // Only allow registration if no users exist (first setup)
  if (userCount > 0) {
    return NextResponse.json(
      { error: "Registration is disabled. Contact an admin." },
      { status: 403 },
    );
  }

  const { data, error } = await parseBody(req, registerSchema);
  if (error) return error;

  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  const user = await db.user.create({
    data: {
      email: data.email,
      name: data.name,
      passwordHash,
      role: "owner", // First user is always owner
    },
  });

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
}
