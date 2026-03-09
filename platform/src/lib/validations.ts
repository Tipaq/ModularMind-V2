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

// ─── Agent schemas ───────────────────────────────────────────────────────────

export const createAgentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional().default(""),
  model: z.string().min(1),
  provider: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  tags: z.array(z.string()).optional().default([]),
});

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  model: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

// ─── Graph schemas ───────────────────────────────────────────────────────────

export const createGraphSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional().default(""),
  nodes: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  edges: z.array(z.record(z.string(), z.unknown())).optional().default([]),
});

export const updateGraphSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  nodes: z.array(z.record(z.string(), z.unknown())).optional(),
  edges: z.array(z.record(z.string(), z.unknown())).optional(),
});

// ─── Automation schemas ─────────────────────────────────────────────────────

export const createAutomationSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional().default(""),
  enabled: z.boolean().optional().default(false),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  tags: z.array(z.string()).optional().default([]),
});

export const updateAutomationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

// ─── Report schemas ─────────────────────────────────────────────────────────

export const reportSchema = z.object({
  status: z.object({
    health: z.string(),
  }),
  models: z.array(z.record(z.string(), z.unknown())),
});

// ─── Chat proxy schemas ─────────────────────────────────────────────────────

export const chatMessageSchema = z.object({
  content: z.string().min(1),
  attachment_ids: z.array(z.string()).max(5).optional(),
});

export const conversationCreateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  supervisor_mode: z.boolean().optional(),
  agent_id: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const conversationPatchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  supervisor_mode: z.boolean().optional(),
  agent_id: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const supervisorLayerPatchSchema = z.object({
  content: z.string().optional(),
  enabled: z.boolean().optional(),
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
