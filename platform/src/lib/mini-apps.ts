import { db } from "./db";
import type { Prisma } from "@prisma/client";

const MAX_FILE_SIZE = 1_048_576; // 1MB per file
const MAX_STORAGE_VALUE_SIZE = 65_536; // 64KB
const MAX_STORAGE_KEYS = 500;
const MAX_SNAPSHOTS = 20;

export async function createMiniApp(data: {
  name: string;
  slug: string;
  description?: string;
  scope?: string;
  allowedGroups?: string[];
  ownerUserId?: string;
  agentId?: string;
  initialHtml?: string;
}) {
  const app = await db.miniApp.create({
    data: {
      name: data.name,
      slug: data.slug,
      description: data.description || "",
      scope: data.scope || "PERSONAL",
      allowedGroups: data.allowedGroups || [],
      ownerUserId: data.ownerUserId,
      agentId: data.agentId,
    },
  });

  if (data.initialHtml) {
    await writeFile(app.id, "index.html", data.initialHtml, "text/html");
  }

  return app;
}

export async function writeFile(
  appId: string,
  path: string,
  content: string,
  contentType: string = "text/plain",
) {
  if (content.length > MAX_FILE_SIZE) {
    throw new Error(`File exceeds max size (${MAX_FILE_SIZE} bytes)`);
  }

  // Auto-snapshot before overwriting (skip for brand new apps with no files)
  const existingFile = await db.miniAppFile.findUnique({
    where: { appId_path: { appId, path } },
  });
  if (existingFile) {
    try {
      await createSnapshot(appId, `auto: before updating ${path}`);
    } catch {
      // Non-blocking — snapshot failure shouldn't prevent writes
    }
  }

  // Store content as s3Key field (reused as content storage for MVP)
  await db.miniAppFile.upsert({
    where: { appId_path: { appId, path } },
    update: { s3Key: content, sizeBytes: content.length, contentType },
    create: { appId, path, s3Key: content, sizeBytes: content.length, contentType },
  });

  await db.miniApp.update({
    where: { id: appId },
    data: { version: { increment: 1 } },
  });

  return { path, size: content.length };
}

export async function readFile(
  appId: string,
  path: string,
): Promise<{ content: string; contentType: string } | null> {
  const file = await db.miniAppFile.findUnique({
    where: { appId_path: { appId, path } },
  });
  if (!file) return null;

  return { content: file.s3Key, contentType: file.contentType };
}

export async function deleteFile(appId: string, path: string): Promise<boolean> {
  const file = await db.miniAppFile.findUnique({
    where: { appId_path: { appId, path } },
  });
  if (!file) return false;

  await db.miniAppFile.delete({ where: { id: file.id } });
  return true;
}

export async function listFiles(appId: string) {
  return db.miniAppFile.findMany({
    where: { appId },
    orderBy: { path: "asc" },
    select: { id: true, path: true, sizeBytes: true, contentType: true, updatedAt: true },
  });
}

export async function setStorageValue(appId: string, key: string, value: unknown) {
  const jsonStr = JSON.stringify(value);
  if (jsonStr.length > MAX_STORAGE_VALUE_SIZE) {
    throw new Error(`Storage value exceeds max size (${MAX_STORAGE_VALUE_SIZE} bytes)`);
  }

  const count = await db.miniAppStorage.count({ where: { appId } });
  const existing = await db.miniAppStorage.findUnique({ where: { appId_key: { appId, key } } });
  if (!existing && count >= MAX_STORAGE_KEYS) {
    throw new Error(`Storage limit reached (${MAX_STORAGE_KEYS} keys)`);
  }

  return db.miniAppStorage.upsert({
    where: { appId_key: { appId, key } },
    update: { value: value as Prisma.InputJsonValue },
    create: { appId, key, value: value as Prisma.InputJsonValue },
  });
}

export async function getStorageValue(appId: string, key: string) {
  const entry = await db.miniAppStorage.findUnique({ where: { appId_key: { appId, key } } });
  return entry?.value ?? null;
}

export async function deleteStorageValue(appId: string, key: string) {
  return db.miniAppStorage.deleteMany({ where: { appId, key } });
}

export async function listStorageKeys(appId: string) {
  return db.miniAppStorage.findMany({
    where: { appId },
    select: { key: true, updatedAt: true },
    orderBy: { key: "asc" },
  });
}

export async function createSnapshot(appId: string, label?: string) {
  const app = await db.miniApp.findUnique({ where: { id: appId }, include: { files: true } });
  if (!app) throw new Error("App not found");

  const fileManifest = app.files.map((f) => ({
    path: f.path,
    content: f.s3Key,
    size: f.sizeBytes,
    contentType: f.contentType,
  }));

  const count = await db.miniAppSnapshot.count({ where: { appId } });
  if (count >= MAX_SNAPSHOTS) {
    const oldest = await db.miniAppSnapshot.findFirst({
      where: { appId },
      orderBy: { createdAt: "asc" },
    });
    if (oldest) {
      await db.miniAppSnapshot.delete({ where: { id: oldest.id } });
    }
  }

  return db.miniAppSnapshot.create({
    data: { appId, version: app.version, label, fileManifest },
  });
}

export async function listSnapshots(appId: string) {
  return db.miniAppSnapshot.findMany({
    where: { appId },
    orderBy: { version: "desc" },
  });
}

export async function rollbackSnapshot(appId: string, version: number) {
  const snapshot = await db.miniAppSnapshot.findFirst({
    where: { appId, version },
  });
  if (!snapshot) throw new Error("Snapshot not found");

  await createSnapshot(appId, `auto-backup before rollback to v${version}`);

  const manifest = snapshot.fileManifest as Array<{
    path: string;
    content: string;
    size: number;
    contentType: string;
  }>;

  await db.miniAppFile.deleteMany({ where: { appId } });

  for (const entry of manifest) {
    await db.miniAppFile.create({
      data: {
        appId,
        path: entry.path,
        s3Key: entry.content,
        sizeBytes: entry.size,
        contentType: entry.contentType,
      },
    });
  }

  await db.miniApp.update({
    where: { id: appId },
    data: { version: { increment: 1 } },
  });

  return { restored: manifest.length };
}
