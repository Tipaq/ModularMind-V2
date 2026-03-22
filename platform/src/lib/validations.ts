import { z } from "zod/v4";
import { NextRequest, NextResponse } from "next/server";

// ─── Client schemas ──────────────────────────────────────────────────────────

export const createClientSchema = z.object({
  name: z.string().min(1).max(255),
  engineUrl: z.url().optional(),
});

export const updateClientSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

// ─── Report schemas ─────────────────────────────────────────────────────────

export const reportSchema = z.object({
  status: z.object({
    health: z.string(),
  }),
  models: z.array(z.record(z.string(), z.unknown())),
});

// ─── Auth schemas ───────────────────────────────────────────────────────────

export const registerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.email(),
  password: z.string().min(8).max(128),
});

// ─── Engine schemas ──────────────────────────────────────────────────────────

export const engineRegisterSchema = z.object({
  url: z.string().optional(),
  version: z.number().int().optional(),
});

export const deploymentConfigSchema = z.object({
  proxyPort: z.number().int().min(1).max(65535).optional(),
  domain: z.string().max(255).optional(),
  useGpu: z.boolean().optional(),
  useTraefik: z.boolean().optional(),
  ollamaEnabled: z.boolean().optional(),
  monitoringEnabled: z.boolean().optional(),
  grafanaPort: z.number().int().min(1).max(65535).optional(),
  mmVersion: z.string().max(50).optional(),
});

export const createEngineSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.url().optional(),
  deploymentConfig: deploymentConfigSchema.optional(),
});

export const updateEngineSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z.url().optional(),
  deploymentConfig: deploymentConfigSchema.optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse and validate request JSON against a Zod schema.
 * Returns `{ data }` on success or `{ error: NextResponse }` on failure.
 */
export async function parseBody<T extends z.ZodType>(
  req: NextRequest,
  schema: T,
): Promise<{ data: z.infer<T>; error?: never } | { data?: never; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      error: NextResponse.json(
        { error: "Validation failed", details: result.error.issues },
        { status: 422 },
      ),
    };
  }

  return { data: result.data };
}
