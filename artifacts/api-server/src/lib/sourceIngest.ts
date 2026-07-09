import { createHash } from "crypto";
import { mkdir, writeFile, readFile, rm, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import * as nodePath from "path";
import { EventEmitter } from "events";
import JSZip from "jszip";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  projectSourcesTable,
  projectSourceFilesTable,
  projectSourceEmbeddingsTable,
  projectSourceSnapshotsTable,
  type ProjectSourceExport,
  type ProjectSourceImport,
} from "@workspace/db";
import {
  walkSourceTree,
  extractExports,
  extractAndResolveImports,
  detectLanguage,
  isTextPath,
  chunkText,
  INLINE_CONTENT_LIMIT,
  shouldSkipPath,
  isLikelyBinary,
  MAX_FILE_BYTES,
} from "@workspace/source-index";
import { embedText } from "./embeddings";
import { logger } from "./logger";

export type IngestProgressEvent = {
  status: "pending" | "indexing" | "ready" | "failed";
  progress: number; // 0..1
  message: string;
  fileCount?: number;
  processed?: number;
};

/** In-memory SSE bus keyed by sourceId. */
const progressBuses = new Map<string, EventEmitter>();

export function getSourceProgressBus(sourceId: string): EventEmitter {
  let bus = progressBuses.get(sourceId);
  if (!bus) {
    bus = new EventEmitter();
    bus.setMaxListeners(50);
    progressBuses.set(sourceId, bus);
  }
  return bus;
}

function emitProgress(sourceId: string, event: IngestProgressEvent) {
  getSourceProgressBus(sourceId).emit("progress", event);
}

function sha256Hex(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function storageObjectKey(projectId: number, sourceId: string, hash: string): string {
  return `${projectId}/${sourceId}/${hash}.txt`;
}

/**
 * Persist large file content. Prefers Supabase Storage bucket `project-sources`
 * when service role credentials are available; otherwise writes under
 * PROJECT_WORKSPACE_ROOT/.project-source-blobs/.
 */
async function persistLargeContent(
  projectId: number,
  sourceId: string,
  hash: string,
  content: string,
): Promise<string> {
  const key = storageObjectKey(projectId, sourceId, hash);
  const supabaseUrl = (
    process.env.SUPABASE_PROD_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PROD_SERVICE_ROLE_KEY ||
    "";

  if (supabaseUrl && serviceKey) {
    try {
      const res = await fetch(`${supabaseUrl}/storage/v1/object/project-sources/${key}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "text/plain; charset=utf-8",
          "x-upsert": "true",
        },
        body: content,
      });
      if (res.ok || res.status === 200 || res.status === 201) {
        return key;
      }
      logger.warn({ status: res.status, key }, "supabase storage upload failed — falling back to local");
    } catch (err) {
      logger.warn({ err, key }, "supabase storage upload error — falling back to local");
    }
  }

  const root =
    process.env.PROJECT_WORKSPACE_ROOT ?? "/home/runner/workspace/.project-workspaces";
  const localPath = nodePath.join(root, ".project-source-blobs", key);
  await mkdir(nodePath.dirname(localPath), { recursive: true });
  await writeFile(localPath, content, "utf-8");
  return `local:${key}`;
}

export async function readStoredContent(storageKey: string): Promise<string | null> {
  if (storageKey.startsWith("local:")) {
    const key = storageKey.slice("local:".length);
    const root =
      process.env.PROJECT_WORKSPACE_ROOT ?? "/home/runner/workspace/.project-workspaces";
    try {
      return await readFile(nodePath.join(root, ".project-source-blobs", key), "utf-8");
    } catch {
      return null;
    }
  }

  const supabaseUrl = (
    process.env.SUPABASE_PROD_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PROD_SERVICE_ROLE_KEY ||
    "";
  if (!supabaseUrl || !serviceKey) return null;
  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/project-sources/${storageKey}`, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function deleteStoredObjectsForSource(
  projectId: number,
  sourceId: string,
): Promise<void> {
  const prefix = `${projectId}/${sourceId}/`;
  const root =
    process.env.PROJECT_WORKSPACE_ROOT ?? "/home/runner/workspace/.project-workspaces";
  try {
    await rm(nodePath.join(root, ".project-source-blobs", String(projectId), sourceId), {
      recursive: true,
      force: true,
    });
  } catch {
    /* ignore */
  }

  const supabaseUrl = (
    process.env.SUPABASE_PROD_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PROD_SERVICE_ROLE_KEY ||
    "";
  if (!supabaseUrl || !serviceKey) return;

  try {
    // List + delete via storage API
    const listRes = await fetch(
      `${supabaseUrl}/storage/v1/object/list/project-sources`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefix, limit: 1000 }),
      },
    );
    if (!listRes.ok) return;
    const items = (await listRes.json()) as Array<{ name: string }>;
    const paths = items.map((i) => `${prefix}${i.name}`);
    if (paths.length === 0) return;
    await fetch(`${supabaseUrl}/storage/v1/object/project-sources`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: [prefix] }),
    });
  } catch (err) {
    logger.warn({ err, sourceId }, "failed to sweep storage objects for source");
  }
}

export type MaterializedFile = { path: string; content: string };

async function materializeZip(storageKeyOrLocal: string, destDir: string): Promise<void> {
  let buffer: Buffer;

  if (storageKeyOrLocal.startsWith("local:") || storageKeyOrLocal.startsWith("/")) {
    const path = storageKeyOrLocal.startsWith("local:")
      ? storageKeyOrLocal.slice("local:".length)
      : storageKeyOrLocal;
    // Also try as absolute path / workspace-relative
    try {
      buffer = await readFile(path);
    } catch {
      const root =
        process.env.PROJECT_WORKSPACE_ROOT ?? "/home/runner/workspace/.project-workspaces";
      buffer = await readFile(nodePath.join(root, ".project-source-blobs", path));
    }
  } else {
    const supabaseUrl = (
      process.env.SUPABASE_PROD_URL ||
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      ""
    ).replace(/\/$/, "");
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_PROD_SERVICE_ROLE_KEY ||
      "";
    if (!supabaseUrl || !serviceKey) {
      throw new Error("ZIP storageKey requires Supabase credentials or a local: path");
    }
    const res = await fetch(`${supabaseUrl}/storage/v1/object/project-sources/${storageKeyOrLocal}`, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    });
    if (!res.ok) throw new Error(`Failed to download ZIP from storage: ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
  }

  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files);
  // Strip common single top-level folder
  const topLevels = new Set(
    names.map((n) => n.split("/")[0]).filter(Boolean),
  );
  const stripPrefix =
    topLevels.size === 1 && names.every((n) => n.startsWith([...topLevels][0]! + "/") || n === [...topLevels][0])
      ? [...topLevels][0]! + "/"
      : "";

  await Promise.all(
    names.map(async (rawPath) => {
      const entry = zip.files[rawPath];
      if (!entry || entry.dir) return;
      let path = rawPath.startsWith(stripPrefix) ? rawPath.slice(stripPrefix.length) : rawPath;
      path = path.replace(/^\/+/, "");
      if (!path || shouldSkipPath(path) || isLikelyBinary(path)) return;
      try {
        const content = await entry.async("nodebuffer");
        if (content.length > MAX_FILE_BYTES) return;
        const abs = nodePath.join(destDir, path);
        await mkdir(nodePath.dirname(abs), { recursive: true });
        await writeFile(abs, content);
      } catch {
        /* skip bad entries */
      }
    }),
  );
}

async function materializeFiles(files: MaterializedFile[], destDir: string): Promise<void> {
  for (const file of files) {
    const path = file.path.replace(/^\/+/, "");
    if (!path || shouldSkipPath(path)) continue;
    const abs = nodePath.join(destDir, path);
    await mkdir(nodePath.dirname(abs), { recursive: true });
    await writeFile(abs, file.content, "utf-8");
  }
}

function detectAliasMap(files: Array<{ path: string; content?: string | null }>): Record<string, string> {
  // Default Vite-style
  const aliases: Record<string, string> = { "@/": "src/" };
  for (const f of files) {
    if (!f.path.endsWith("tsconfig.json") && !f.path.endsWith("jsconfig.json")) continue;
    const content = f.content;
    if (!content) continue;
    try {
      const json = JSON.parse(content.replace(/,\s*([}\]])/g, "$1"));
      const paths = json?.compilerOptions?.paths as Record<string, string[]> | undefined;
      if (!paths) continue;
      for (const [key, vals] of Object.entries(paths)) {
        const target = vals?.[0];
        if (!target) continue;
        const prefix = key.replace(/\*$/, "");
        const mapped = target.replace(/\*$/, "").replace(/^\.\//, "");
        if (prefix && mapped) aliases[prefix] = mapped.endsWith("/") ? mapped : `${mapped}/`;
      }
    } catch {
      /* ignore bad tsconfig */
    }
  }
  return aliases;
}

export type RunIngestArgs = {
  sourceId: string;
  projectId: number;
  sourceType: string;
  payload: {
    storageKey?: string;
    files?: MaterializedFile[];
  };
};

/**
 * Full ingestion pipeline. Safe to call fire-and-forget after creating the source row.
 */
export async function runSourceIngest(args: RunIngestArgs): Promise<void> {
  const { sourceId, projectId, sourceType, payload } = args;
  const fileErrors: string[] = [];
  let tmpDir: string | null = null;

  try {
    await db
      .update(projectSourcesTable)
      .set({ lastIngestStatus: "indexing", lastIngestError: null, updatedAt: new Date() })
      .where(eq(projectSourcesTable.id, sourceId));

    emitProgress(sourceId, { status: "indexing", progress: 0.02, message: "Materializing source files" });

    tmpDir = await mkdtemp(nodePath.join(tmpdir(), `src-${sourceId.slice(0, 8)}-`));

    if (sourceType === "zip") {
      if (!payload.storageKey) throw new Error("zip ingest requires payload.storageKey");
      await materializeZip(payload.storageKey, tmpDir);
    } else if (sourceType === "generated" || sourceType === "pasted") {
      if (!payload.files?.length) throw new Error(`${sourceType} ingest requires payload.files`);
      await materializeFiles(payload.files, tmpDir);
    } else {
      throw new Error(`Source type "${sourceType}" is not supported in Phase 1 (use zip|generated|pasted)`);
    }

    emitProgress(sourceId, { status: "indexing", progress: 0.1, message: "Walking file tree" });

    const walked = await walkSourceTree(tmpDir);
    const total = walked.length;
    const knownFiles = new Set(walked.map((f) => f.relativePath));

    // Pre-read tsconfig for aliases
    const configSnippets: Array<{ path: string; content: string | null }> = [];
    for (const f of walked) {
      if (f.relativePath.endsWith("tsconfig.json") || f.relativePath.endsWith("jsconfig.json")) {
        try {
          configSnippets.push({
            path: f.relativePath,
            content: await readFile(f.absolutePath, "utf-8"),
          });
        } catch {
          configSnippets.push({ path: f.relativePath, content: null });
        }
      }
    }
    const aliases = detectAliasMap(configSnippets);

    // Clear previous files/embeddings for this source (reingest)
    await db.delete(projectSourceFilesTable).where(eq(projectSourceFilesTable.sourceId, sourceId));

    const manifest: Record<string, string> = {};
    let totalBytes = 0;
    let processed = 0;

    emitProgress(sourceId, {
      status: "indexing",
      progress: 0.15,
      message: `Indexing ${total} files`,
      fileCount: total,
      processed: 0,
    });

    for (const file of walked) {
      try {
        let content = "";
        if (isTextPath(file.relativePath)) {
          content = await readFile(file.absolutePath, "utf-8");
        } else {
          // still index metadata for non-text under size limit
          content = "";
        }
        const hash = sha256Hex(content || Buffer.from(`binary:${file.relativePath}:${file.sizeBytes}`));
        manifest[file.relativePath] = hash;
        totalBytes += file.sizeBytes;

        const language = detectLanguage(file.relativePath);
        const exportsList: ProjectSourceExport[] =
          content && language && ["ts", "tsx", "js", "jsx"].includes(language)
            ? extractExports(content)
            : [];
        const importsList: ProjectSourceImport[] =
          content && language && ["ts", "tsx", "js", "jsx"].includes(language)
            ? extractAndResolveImports(content, file.relativePath, {
                root: tmpDir,
                knownFiles,
                aliases,
              })
            : [];

        let inlineContent: string | null = content;
        let storageKey: string | null = null;
        const sizeBytes = Buffer.byteLength(content, "utf-8") || file.sizeBytes;
        if (sizeBytes >= INLINE_CONTENT_LIMIT) {
          storageKey = await persistLargeContent(projectId, sourceId, hash, content);
          inlineContent = null;
        }

        const [inserted] = await db
          .insert(projectSourceFilesTable)
          .values({
            sourceId,
            path: file.relativePath,
            sizeBytes,
            sha256: hash,
            language,
            content: inlineContent,
            storageKey,
            exports: exportsList,
            imports: importsList,
            indexedAt: new Date(),
          })
          .returning({ id: projectSourceFilesTable.id });

        // Embeddings — best effort, soft-fail per file
        if (inserted && content && isTextPath(file.relativePath)) {
          const chunks = chunkText(content);
          for (const chunk of chunks) {
            try {
              const embedding = await embedText(chunk.content);
              const vectorStr = embedding ? `[${embedding.join(",")}]` : null;
              if (vectorStr) {
                await db.execute(sql`
                  INSERT INTO project_source_embeddings
                    (file_id, chunk_index, line_start, line_end, content, embedding)
                  VALUES (
                    ${inserted.id}::uuid,
                    ${chunk.chunkIndex},
                    ${chunk.lineStart},
                    ${chunk.lineEnd},
                    ${chunk.content},
                    ${vectorStr}::vector
                  )
                  ON CONFLICT DO NOTHING
                `);
              } else {
                await db.insert(projectSourceEmbeddingsTable).values({
                  fileId: inserted.id,
                  chunkIndex: chunk.chunkIndex,
                  lineStart: chunk.lineStart,
                  lineEnd: chunk.lineEnd,
                  content: chunk.content,
                });
              }
            } catch (err) {
              fileErrors.push(`${file.relativePath}: embed failed (${String(err).slice(0, 80)})`);
            }
          }
        }
      } catch (err) {
        fileErrors.push(`${file.relativePath}: ${String(err).slice(0, 120)}`);
      }

      processed++;
      if (processed % 25 === 0 || processed === total) {
        emitProgress(sourceId, {
          status: "indexing",
          progress: 0.15 + 0.8 * (processed / Math.max(total, 1)),
          message: `Indexed ${processed}/${total} files`,
          fileCount: total,
          processed,
        });
      }
    }

    await db.insert(projectSourceSnapshotsTable).values({
      sourceId,
      takenAt: new Date(),
      fileManifest: manifest,
    });

    await db
      .update(projectSourcesTable)
      .set({
        lastIngestStatus: "ready",
        lastIngestedAt: new Date(),
        lastIngestError: fileErrors.length ? JSON.stringify(fileErrors.slice(0, 50)) : null,
        fileCount: Object.keys(manifest).length,
        totalBytes,
        updatedAt: new Date(),
      })
      .where(eq(projectSourcesTable.id, sourceId));

    emitProgress(sourceId, {
      status: "ready",
      progress: 1,
      message: `Ready — ${Object.keys(manifest).length} files indexed`,
      fileCount: Object.keys(manifest).length,
      processed: Object.keys(manifest).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, sourceId }, "source ingest failed");
    await db
      .update(projectSourcesTable)
      .set({
        lastIngestStatus: "failed",
        lastIngestError: message.slice(0, 2000),
        updatedAt: new Date(),
      })
      .where(eq(projectSourcesTable.id, sourceId));
    emitProgress(sourceId, { status: "failed", progress: 1, message });
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export async function getFileContent(file: {
  content: string | null;
  storageKey: string | null;
}): Promise<string | null> {
  if (file.content != null) return file.content;
  if (file.storageKey) return readStoredContent(file.storageKey);
  return null;
}

/** Ensure a source belongs to a project owned by userId. */
export async function assertSourceAccess(
  sourceId: string,
  userId: number,
): Promise<{ source: typeof projectSourcesTable.$inferSelect; projectId: number } | null> {
  const rows = await db.execute(sql`
    SELECT s.*, p.user_id AS owner_user_id
    FROM project_sources s
    JOIN projects p ON p.id = s.project_id
    WHERE s.id = ${sourceId}::uuid
    LIMIT 1
  `);
  const row = (rows.rows as any[])[0];
  if (!row) return null;
  if (Number(row.owner_user_id) !== userId) return null;
  const [source] = await db
    .select()
    .from(projectSourcesTable)
    .where(eq(projectSourcesTable.id, sourceId))
    .limit(1);
  if (!source) return null;
  return { source, projectId: source.projectId };
}

export async function setPrimarySource(projectId: number, sourceId: string): Promise<void> {
  await db
    .update(projectSourcesTable)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(and(eq(projectSourcesTable.projectId, projectId), eq(projectSourcesTable.isPrimary, true)));
  await db
    .update(projectSourcesTable)
    .set({ isPrimary: true, updatedAt: new Date() })
    .where(eq(projectSourcesTable.id, sourceId));
}
