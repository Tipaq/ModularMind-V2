import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { engineFetch } from "@/lib/engine-proxy";
import { parseBody, supervisorLayerPatchSchema } from "@/lib/validations";

// PATCH /api/chat/supervisor/layers/:key — Update a supervisor layer
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { session, error: authError } = await requireAuth();
  if (authError) return authError;

  const { key } = await params;
  const { data, error } = await parseBody(req, supervisorLayerPatchSchema);
  if (error) return error;

  const res = await engineFetch(
    `/api/v1/internal/supervisor/layers/${key}`,
    { method: "PATCH", body: JSON.stringify(data) },
    session.user?.email ?? undefined,
  );
  const responseData = await res.json();

  return NextResponse.json(responseData, { status: res.status });
}
