import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  projectSourcesTable,
  projectSourceFilesTable,
  projectSourceSnapshotsTable,
  PROJECT_SOURCE_TYPES,
  type ProjectSource,
  type ProjectSourceImport,
  type ProjectSourceSnapshot,
} from "@workspace/db";
import {
  buildFileTree,
  scanProjectRoutes,
  type DetectedRoute,
} from "@workspace/source-index";
import { assertProjectOwner } from "../lib/projectWorkspace";
import {
  assertSourceAccess,
  getFileContent,
  getSourceProgressBus,
  runSourceIngest,
  setPrimarySource,
  deleteStoredObjectsForSource,
  type IngestProgressEvent,
} from "../lib/sourceIngest";
import { embedText } from "../lib/embeddings";
import OpenAI from "openai";

const router: IRouter = Router();

const uuidParam = z.string().uuid();
const projectIdParam = z.coerce.number().int().positive();

const IngestBody = z.object({
  sourceType: z.enum(PROJECT_SOURCE_TYPES),
  sourceRef: z.record(z.string(), z.unknown()).optional(),
  payload: z
    .object({
      storageKey: z.string().min(1).optional(),
      files: z
        .array(z.object({ path: z.string().min(1), content: z.string() }))
        .optional(),
    })
    .default({}),
  isPrimary: z.boolean().optional(),
});

function authUserId(req: import("express").Request): number {
  return (req as any).authUser.id as number;
}

function startSse(res: import("express").Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}

function sendSse(res: import("express").Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── POST /sources/:projectId/ingest ──────────────────────────────────────────

router.post("/sources/:projectId/ingest", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  const projectParsed = projectIdParam.safeParse(req.params.projectId);
  if (!projectParsed.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const projectId = projectParsed.data;
  if (!(await assertProjectOwner(projectId, userId))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const body = IngestBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body", details: body.error.flatten() });
    return;
  }

  const { sourceType, payload, isPrimary } = body.data;
  const sourceRef = body.data.sourceRef ?? {};

  if (sourceType === "github" || sourceType === "replit") {
    res.status(501).json({
      error: `Source type "${sourceType}" is Phase 2 — use zip, generated, or pasted`,
    });
    return;
  }
  if (sourceType === "zip" && !payload.storageKey) {
    res.status(400).json({ error: "zip ingest requires payload.storageKey" });
    return;
  }
  if ((sourceType === "generated" || sourceType === "pasted") && !payload.files?.length) {
    res.status(400).json({ error: `${sourceType} ingest requires payload.files` });
    return;
  }

  // First source for a project becomes primary by default
  const existing = await db
    .select({ id: projectSourcesTable.id })
    .from(projectSourcesTable)
    .where(eq(projectSourcesTable.projectId, projectId))
    .limit(1);
  const makePrimary = isPrimary ?? existing.length === 0;

  if (makePrimary) {
    await db
      .update(projectSourcesTable)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(
        and(eq(projectSourcesTable.projectId, projectId), eq(projectSourcesTable.isPrimary, true)),
      );
  }

  const [source] = await db
    .insert(projectSourcesTable)
    .values({
      projectId,
      sourceType,
      sourceRef: {
        ...sourceRef,
        ...(sourceType === "zip" && payload.storageKey ? { storageKey: payload.storageKey } : {}),
        ...(payload.files ? { fileCount: payload.files.length } : {}),
      },
      isPrimary: makePrimary,
      lastIngestStatus: "pending",
    })
    .returning();

  if (!source) {
    res.status(500).json({ error: "Failed to create source" });
    return;
  }

  // Fire-and-forget async ingest
  void runSourceIngest({
    sourceId: source.id,
    projectId,
    sourceType,
    payload: {
      storageKey: payload.storageKey,
      files: payload.files,
    },
  });

  res.status(202).json({ sourceId: source.id, status: "indexing" });
});

// ── POST /sources/:sourceId/reingest ─────────────────────────────────────────

router.post("/sources/:sourceId/reingest", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  const sourceIdParsed = uuidParam.safeParse(req.params.sourceId);
  if (!sourceIdParsed.success) {
    res.status(400).json({ error: "Invalid source id" });
    return;
  }
  const access = await assertSourceAccess(sourceIdParsed.data, userId);
  if (!access) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  const { source, projectId } = access;
  const prevSnap = await db
    .select()
    .from(projectSourceSnapshotsTable)
    .where(eq(projectSourceSnapshotsTable.sourceId, source.id))
    .orderBy(desc(projectSourceSnapshotsTable.takenAt))
    .limit(1);

  const payloadBody = z
    .object({
      storageKey: z.string().optional(),
      files: z.array(z.object({ path: z.string(), content: z.string() })).optional(),
    })
    .safeParse(req.body ?? {});

  const storageKey =
    payloadBody.success && payloadBody.data.storageKey
      ? payloadBody.data.storageKey
      : typeof source.sourceRef?.storageKey === "string"
        ? source.sourceRef.storageKey
        : undefined;
  const files = payloadBody.success ? payloadBody.data.files : undefined;

  if (source.sourceType === "zip" && !storageKey) {
    res.status(400).json({ error: "reingest zip requires storageKey (body or source_ref)" });
    return;
  }
  if (
    (source.sourceType === "generated" || source.sourceType === "pasted") &&
    !files?.length
  ) {
    res.status(400).json({ error: "reingest requires payload.files for generated/pasted" });
    return;
  }

  void runSourceIngest({
    sourceId: source.id,
    projectId,
    sourceType: source.sourceType,
    payload: { storageKey, files },
  }).then(async () => {
    // diff summary computed by client via GET /diff; nothing else needed
  });

  res.status(202).json({
    sourceId: source.id,
    status: "indexing",
    previousSnapshotId: prevSnap[0]?.id ?? null,
  });
});

// ── DELETE /sources/:sourceId ────────────────────────────────────────────────

router.delete("/sources/:sourceId", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  const sourceIdParsed = uuidParam.safeParse(req.params.sourceId);
  if (!sourceIdParsed.success) {
    res.status(400).json({ error: "Invalid source id" });
    return;
  }
  const access = await assertSourceAccess(sourceIdParsed.data, userId);
  if (!access) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  await deleteStoredObjectsForSource(access.projectId, access.source.id);
  await db.delete(projectSourcesTable).where(eq(projectSourcesTable.id, access.source.id));
  res.status(204).end();
});

// ── GET /sources/:projectId — list ───────────────────────────────────────────

router.get("/sources/:projectId", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  const projectParsed = projectIdParam.safeParse(req.params.projectId);
  if (!projectParsed.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  if (!(await assertProjectOwner(projectParsed.data, userId))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const rows = await db
    .select()
    .from(projectSourcesTable)
    .where(eq(projectSourcesTable.projectId, projectParsed.data))
    .orderBy(desc(projectSourcesTable.createdAt));

  res.json({
    sources: rows.map((r: ProjectSource) => ({
      id: r.id,
      projectId: r.projectId,
      sourceType: r.sourceType,
      sourceRef: r.sourceRef,
      isPrimary: r.isPrimary,
      lastIngestedAt: r.lastIngestedAt?.toISOString() ?? null,
      lastIngestStatus: r.lastIngestStatus,
      lastIngestError: r.lastIngestError,
      fileCount: r.fileCount,
      totalBytes: r.totalBytes,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
});

// ── GET /sources/:sourceId/events — SSE progress ─────────────────────────────

router.get("/sources/:sourceId/events", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  const sourceIdParsed = uuidParam.safeParse(req.params.sourceId);
  if (!sourceIdParsed.success) {
    res.status(400).json({ error: "Invalid source id" });
    return;
  }
  const access = await assertSourceAccess(sourceIdParsed.data, userId);
  if (!access) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  startSse(res);
  const bus = getSourceProgressBus(access.source.id);

  // Immediate snapshot of current status
  const status = (
    ["pending", "indexing", "ready", "failed"] as const
  ).includes(access.source.lastIngestStatus as IngestProgressEvent["status"])
    ? (access.source.lastIngestStatus as IngestProgressEvent["status"])
    : "pending";
  sendSse(res, "progress", {
    status,
    progress: status === "ready" || status === "failed" ? 1 : 0,
    message: status,
    fileCount: access.source.fileCount,
  } satisfies IngestProgressEvent);

  const onProgress = (event: IngestProgressEvent) => {
    sendSse(res, "progress", event);
    if (event.status === "ready" || event.status === "failed") {
      res.end();
    }
  };
  bus.on("progress", onProgress);
  req.on("close", () => {
    bus.off("progress", onProgress);
  });
});

// ── GET /sources/:sourceId/tree ──────────────────────────────────────────────

router.get("/sources/:sourceId/tree", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  const sourceIdParsed = uuidParam.safeParse(req.params.sourceId);
  if (!sourceIdParsed.success) {
    res.status(400).json({ error: "Invalid source id" });
    return;
  }
  const access = await assertSourceAccess(sourceIdParsed.data, userId);
  if (!access) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  const depthRaw = typeof req.query.depth === "string" ? parseInt(req.query.depth, 10) : undefined;
  const depth = depthRaw && Number.isFinite(depthRaw) ? depthRaw : undefined;

  const files = await db
    .select({
      path: projectSourceFilesTable.path,
      sizeBytes: projectSourceFilesTable.sizeBytes,
      language: projectSourceFilesTable.language,
    })
    .from(projectSourceFilesTable)
    .where(eq(projectSourceFilesTable.sourceId, access.source.id));

  res.json({
    sourceId: access.source.id,
    fileCount: files.length,
    tree: buildFileTree(files, depth),
  });
});

// ── GET /sources/:sourceId/file ──────────────────────────────────────────────

router.get("/sources/:sourceId/file", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  const sourceIdParsed = uuidParam.safeParse(req.params.sourceId);
  if (!sourceIdParsed.success) {
    res.status(400).json({ error: "Invalid source id" });
    return;
  }
  const access = await assertSourceAccess(sourceIdParsed.data, userId);
  if (!access) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  const path = typeof req.query.path === "string" ? req.query.path.replace(/^\/+/, "") : "";
  if (!path) {
    res.status(400).json({ error: "path query required" });
    return;
  }

  const [file] = await db
    .select()
    .from(projectSourceFilesTable)
    .where(
      and(
        eq(projectSourceFilesTable.sourceId, access.source.id),
        eq(projectSourceFilesTable.path, path),
      ),
    )
    .limit(1);
  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  let content = await getFileContent(file);
  if (content == null) {
    res.status(404).json({ error: "File content unavailable" });
    return;
  }

  const lineStart = typeof req.query.lineStart === "string" ? parseInt(req.query.lineStart, 10) : undefined;
  const lineEnd = typeof req.query.lineEnd === "string" ? parseInt(req.query.lineEnd, 10) : undefined;
  let rangeStart = 1;
  let rangeEnd = content.split("\n").length;
  if (lineStart && Number.isFinite(lineStart)) {
    const lines = content.split("\n");
    const start = Math.max(1, lineStart);
    const end = lineEnd && Number.isFinite(lineEnd) ? Math.min(lines.length, lineEnd) : lines.length;
    content = lines.slice(start - 1, end).join("\n");
    rangeStart = start;
    rangeEnd = end;
  }

  res.json({
    path: file.path,
    language: file.language,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
    lineStart: rangeStart,
    lineEnd: rangeEnd,
    content,
    exports: file.exports,
    imports: file.imports,
  });
});

// ── GET /sources/:sourceId/search ────────────────────────────────────────────

router.get("/sources/:sourceId/search", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  const sourceIdParsed = uuidParam.safeParse(req.params.sourceId);
  if (!sourceIdParsed.success) {
    res.status(400).json({ error: "Invalid source id" });
    return;
  }
  const access = await assertSourceAccess(sourceIdParsed.data, userId);
  if (!access) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  const q = typeof req.query.q === "string" ? req.query.q : "";
  if (!q) {
    res.status(400).json({ error: "q query required" });
    return;
  }
  const type = req.query.type === "regex" ? "regex" : "literal";
  const glob = typeof req.query.glob === "string" ? req.query.glob : undefined;

  let pattern: RegExp;
  try {
    pattern =
      type === "regex"
        ? new RegExp(q, "g")
        : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  } catch {
    res.status(400).json({ error: "Invalid regex" });
    return;
  }

  const files = await db
    .select({
      path: projectSourceFilesTable.path,
      content: projectSourceFilesTable.content,
      storageKey: projectSourceFilesTable.storageKey,
    })
    .from(projectSourceFilesTable)
    .where(eq(projectSourceFilesTable.sourceId, access.source.id));

  const globRe = glob
    ? new RegExp(
        "^" +
          glob
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*\*/g, ".*")
            .replace(/\*/g, "[^/]*") +
          "$",
      )
    : null;

  const hits: Array<{
    path: string;
    line: number;
    preview: string;
    matchRange: [number, number];
  }> = [];
  const MAX = 200;

  for (const file of files) {
    if (hits.length >= MAX) break;
    if (globRe && !globRe.test(file.path)) continue;
    const content = await getFileContent(file);
    if (!content) continue;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (hits.length >= MAX) break;
      const line = lines[i]!;
      pattern.lastIndex = 0;
      const m = pattern.exec(line);
      if (!m) continue;
      hits.push({
        path: file.path,
        line: i + 1,
        preview: line.slice(0, 240),
        matchRange: [m.index, m.index + m[0].length],
      });
    }
  }

  res.json({ query: q, type, hits, capped: hits.length >= MAX });
});

// ── GET /sources/:sourceId/symbols ───────────────────────────────────────────

router.get("/sources/:sourceId/symbols", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  const sourceIdParsed = uuidParam.safeParse(req.params.sourceId);
  if (!sourceIdParsed.success) {
    res.status(400).json({ error: "Invalid source id" });
    return;
  }
  const access = await assertSourceAccess(sourceIdParsed.data, userId);
  if (!access) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  const name = typeof req.query.name === "string" ? req.query.name : "";
  if (!name) {
    res.status(400).json({ error: "name query required" });
    return;
  }

  // JSONB containment / text search against exports
  const rows = await db.execute(sql`
    SELECT path, exports
    FROM project_source_files
    WHERE source_id = ${access.source.id}::uuid
      AND exports::text ILIKE ${"%" + name + "%"}
    LIMIT 100
  `);

  const symbols: Array<{ path: string; name: string; kind: string; line: number }> = [];
  for (const row of rows.rows as any[]) {
    const exports = (row.exports ?? []) as Array<{ name: string; kind: string; line: number }>;
    for (const exp of exports) {
      if (exp.name === name || exp.name.toLowerCase().includes(name.toLowerCase())) {
        symbols.push({ path: row.path, name: exp.name, kind: exp.kind, line: exp.line });
      }
    }
  }

  res.json({ name, symbols });
});

// ── GET /sources/:sourceId/imports ───────────────────────────────────────────

router.get("/sources/:sourceId/imports", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  const sourceIdParsed = uuidParam.safeParse(req.params.sourceId);
  if (!sourceIdParsed.success) {
    res.status(400).json({ error: "Invalid source id" });
    return;
  }
  const access = await assertSourceAccess(sourceIdParsed.data, userId);
  if (!access) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  const path = typeof req.query.path === "string" ? req.query.path.replace(/^\/+/, "") : "";
  if (!path) {
    res.status(400).json({ error: "path query required" });
    return;
  }
  const direction = req.query.direction === "in" ? "in" : "out";

  if (direction === "out") {
    const [file] = await db
      .select({ imports: projectSourceFilesTable.imports })
      .from(projectSourceFilesTable)
      .where(
        and(
          eq(projectSourceFilesTable.sourceId, access.source.id),
          eq(projectSourceFilesTable.path, path),
        ),
      )
      .limit(1);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.json({
      path,
      direction: "out",
      edges: ((file.imports ?? []) as ProjectSourceImport[]).map((imp) => ({
        path: imp.resolvedPath,
        specifier: imp.specifier,
        line: imp.line,
      })),
    });
    return;
  }

  // direction=in — who imports this file
  const rows = await db.execute(sql`
    SELECT path, imports
    FROM project_source_files
    WHERE source_id = ${access.source.id}::uuid
      AND imports::text LIKE ${"%" + path + "%"}
  `);

  const edges: Array<{ path: string; line: number; specifier?: string }> = [];
  for (const row of rows.rows as any[]) {
    const imports = (row.imports ?? []) as Array<{
      specifier: string;
      resolvedPath: string | null;
      line: number;
    }>;
    for (const imp of imports) {
      if (imp.resolvedPath === path) {
        edges.push({ path: row.path, line: imp.line, specifier: imp.specifier });
      }
    }
  }

  res.json({ path, direction: "in", edges });
});

// ── GET /sources/:sourceId/routes ────────────────────────────────────────────

router.get("/sources/:sourceId/routes", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  const sourceIdParsed = uuidParam.safeParse(req.params.sourceId);
  if (!sourceIdParsed.success) {
    res.status(400).json({ error: "Invalid source id" });
    return;
  }
  const access = await assertSourceAccess(sourceIdParsed.data, userId);
  if (!access) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  const files = await db
    .select({
      path: projectSourceFilesTable.path,
      content: projectSourceFilesTable.content,
      storageKey: projectSourceFilesTable.storageKey,
      language: projectSourceFilesTable.language,
    })
    .from(projectSourceFilesTable)
    .where(eq(projectSourceFilesTable.sourceId, access.source.id));

  const loaded: Array<{ path: string; content: string }> = [];
  for (const f of files) {
    // Only scan likely route-bearing files
    if (
      !/\.(tsx?|jsx?|mjs|cjs)$/.test(f.path) &&
      !/supabase\/functions\//.test(f.path)
    ) {
      continue;
    }
    const content = await getFileContent(f);
    if (content) loaded.push({ path: f.path, content });
  }

  const routes: DetectedRoute[] = scanProjectRoutes(loaded);
  res.json({ sourceId: access.source.id, routes });
});

// ── POST /sources/:sourceId/qa ───────────────────────────────────────────────

router.post("/sources/:sourceId/qa", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  const sourceIdParsed = uuidParam.safeParse(req.params.sourceId);
  if (!sourceIdParsed.success) {
    res.status(400).json({ error: "Invalid source id" });
    return;
  }
  const access = await assertSourceAccess(sourceIdParsed.data, userId);
  if (!access) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  const body = z
    .object({ question: z.string().min(1), k: z.number().int().min(1).max(20).optional() })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "question required" });
    return;
  }

  const k = body.data.k ?? 8;
  const embedding = await embedText(body.data.question);
  type Citation = { path: string; lineStart: number; lineEnd: number; snippet: string; score: number };
  let citations: Citation[] = [];

  if (embedding) {
    const vectorStr = `[${embedding.join(",")}]`;
    try {
      const rows = await db.execute(sql`
        SELECT e.content, e.line_start, e.line_end, f.path,
               1 - (e.embedding <=> ${vectorStr}::vector) AS score
        FROM project_source_embeddings e
        JOIN project_source_files f ON f.id = e.file_id
        WHERE f.source_id = ${access.source.id}::uuid
          AND e.embedding IS NOT NULL
        ORDER BY e.embedding <=> ${vectorStr}::vector
        LIMIT ${k}
      `);
      citations = (rows.rows as any[]).map((r) => ({
        path: r.path as string,
        lineStart: Number(r.line_start),
        lineEnd: Number(r.line_end),
        snippet: String(r.content).slice(0, 600),
        score: Number(r.score),
      }));
    } catch {
      citations = [];
    }
  }

  // Fallback: keyword search if no embeddings
  if (!citations.length) {
    const tokens = body.data.question
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 3)
      .slice(0, 5);
    if (tokens.length) {
      const files = await db
        .select({
          path: projectSourceFilesTable.path,
          content: projectSourceFilesTable.content,
          storageKey: projectSourceFilesTable.storageKey,
        })
        .from(projectSourceFilesTable)
        .where(eq(projectSourceFilesTable.sourceId, access.source.id))
        .limit(200);
      for (const f of files) {
        const content = await getFileContent(f);
        if (!content) continue;
        const lower = content.toLowerCase();
        const hit = tokens.find((t) => lower.includes(t));
        if (!hit) continue;
        const idx = lower.indexOf(hit);
        const lineStart = content.slice(0, idx).split("\n").length;
        const lines = content.split("\n");
        const snippet = lines.slice(Math.max(0, lineStart - 1), lineStart + 15).join("\n");
        citations.push({
          path: f.path,
          lineStart,
          lineEnd: Math.min(lines.length, lineStart + 15),
          snippet: snippet.slice(0, 600),
          score: 0.4,
        });
        if (citations.length >= k) break;
      }
    }
  }

  let answer =
    citations.length === 0
      ? "I could not find relevant code in the indexed source for that question."
      : `Based on ${citations.length} code region${citations.length === 1 ? "" : "s"} in the project source index:`;

  // Optional LLM synthesis when OpenAI is configured
  if (citations.length && process.env.OPENAI_API_KEY) {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const context = citations
        .map(
          (c, i) =>
            `[${i + 1}] ${c.path}:L${c.lineStart}-L${c.lineEnd}\n${c.snippet}`,
        )
        .join("\n\n");
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You answer questions about a user's codebase. Cite paths as path:Lstart-Lend. Be concise.",
          },
          {
            role: "user",
            content: `Question: ${body.data.question}\n\nCode excerpts:\n${context}`,
          },
        ],
      });
      answer = completion.choices[0]?.message?.content?.trim() || answer;
    } catch {
      // keep retrieval-only answer
      answer +=
        "\n\n" +
        citations
          .slice(0, 3)
          .map((c) => `- ${c.path}:L${c.lineStart}-L${c.lineEnd}`)
          .join("\n");
    }
  } else if (citations.length) {
    answer +=
      "\n\n" +
      citations
        .slice(0, 5)
        .map((c) => `- ${c.path}:L${c.lineStart}-L${c.lineEnd}`)
        .join("\n");
  }

  res.json({
    answer,
    citations: citations.map(({ path, lineStart, lineEnd, snippet }) => ({
      path,
      lineStart,
      lineEnd,
      snippet,
    })),
  });
});

// ── GET /sources/:sourceId/diff ──────────────────────────────────────────────

router.get("/sources/:sourceId/diff", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  const sourceIdParsed = uuidParam.safeParse(req.params.sourceId);
  if (!sourceIdParsed.success) {
    res.status(400).json({ error: "Invalid source id" });
    return;
  }
  const access = await assertSourceAccess(sourceIdParsed.data, userId);
  if (!access) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  const since = typeof req.query.since === "string" ? req.query.since : "";
  if (!since) {
    res.status(400).json({ error: "since query required (snapshotId or ISO timestamp)" });
    return;
  }

  const snaps = await db
    .select()
    .from(projectSourceSnapshotsTable)
    .where(eq(projectSourceSnapshotsTable.sourceId, access.source.id))
    .orderBy(desc(projectSourceSnapshotsTable.takenAt));

  if (snaps.length === 0) {
    res.json({ added: [], removed: [], modified: [] });
    return;
  }

  const latest = snaps[0]!;
  let baseline = snaps.find((s: ProjectSourceSnapshot) => s.id === since);
  if (!baseline) {
    const sinceDate = new Date(since);
    if (!Number.isNaN(sinceDate.getTime())) {
      baseline =
        snaps.find((s: ProjectSourceSnapshot) => s.takenAt <= sinceDate) ??
        snaps[snaps.length - 1];
    }
  }
  if (!baseline) {
    res.status(404).json({ error: "Baseline snapshot not found" });
    return;
  }

  const oldManifest = baseline.fileManifest ?? {};
  const newManifest = latest.fileManifest ?? {};
  const oldPaths = new Set(Object.keys(oldManifest));
  const newPaths = new Set(Object.keys(newManifest));

  const added = [...newPaths].filter((p) => !oldPaths.has(p)).sort();
  const removed = [...oldPaths].filter((p) => !newPaths.has(p)).sort();
  const modified = [...newPaths]
    .filter((p) => oldPaths.has(p) && oldManifest[p] !== newManifest[p])
    .map((path) => ({ path, oldSha: oldManifest[path]!, newSha: newManifest[path]! }))
    .sort((a, b) => a.path.localeCompare(b.path));

  res.json({
    since: baseline.id,
    sinceTakenAt: baseline.takenAt.toISOString(),
    latestSnapshotId: latest.id,
    latestTakenAt: latest.takenAt.toISOString(),
    added,
    removed,
    modified,
  });
});

// ── POST /sources/:sourceId/impact (Phase 2 stub — useful early) ─────────────

router.post("/sources/:sourceId/impact", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  const sourceIdParsed = uuidParam.safeParse(req.params.sourceId);
  if (!sourceIdParsed.success) {
    res.status(400).json({ error: "Invalid source id" });
    return;
  }
  const access = await assertSourceAccess(sourceIdParsed.data, userId);
  if (!access) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  const body = z
    .object({
      paths: z.array(z.string()).min(1),
      depth: z.number().int().min(1).max(5).optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "paths required" });
    return;
  }

  const depth = body.data.depth ?? 2;
  const files = await db
    .select({
      path: projectSourceFilesTable.path,
      imports: projectSourceFilesTable.imports,
      exports: projectSourceFilesTable.exports,
      content: projectSourceFilesTable.content,
      storageKey: projectSourceFilesTable.storageKey,
    })
    .from(projectSourceFilesTable)
    .where(eq(projectSourceFilesTable.sourceId, access.source.id));

  // Build reverse import graph
  const reverse = new Map<string, Array<{ path: string; line: number }>>();
  for (const f of files) {
    for (const imp of f.imports ?? []) {
      if (!imp.resolvedPath) continue;
      const list = reverse.get(imp.resolvedPath) ?? [];
      list.push({ path: f.path, line: imp.line });
      reverse.set(imp.resolvedPath, list);
    }
  }

  const callers: Array<{ path: string; line: number }> = [];
  const seen = new Set<string>();
  let frontier = [...body.data.paths];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const p of frontier) {
      for (const edge of reverse.get(p) ?? []) {
        const key = `${edge.path}:${edge.line}`;
        if (seen.has(key)) continue;
        seen.add(key);
        callers.push(edge);
        next.push(edge.path);
      }
    }
    frontier = next;
  }

  // Routes that touch any caller or seed path
  const seed = new Set([...body.data.paths, ...callers.map((c) => c.path)]);
  const routeFiles: Array<{ path: string; content: string }> = [];
  for (const f of files) {
    if (!seed.has(f.path)) continue;
    const content = await getFileContent(f);
    if (content) routeFiles.push({ path: f.path, content });
  }
  const routes = scanProjectRoutes(routeFiles);

  const components = files
    .filter((f: { path: string }) => seed.has(f.path) && /\.(tsx|jsx)$/.test(f.path))
    .map((f: { path: string }) => f.path);

  res.json({
    callers,
    routes,
    components,
    estimatedBlastRadius: new Set(callers.map((c) => c.path)).size + body.data.paths.length,
  });
});

// Convenience: mark primary
router.post("/sources/:sourceId/primary", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  const sourceIdParsed = uuidParam.safeParse(req.params.sourceId);
  if (!sourceIdParsed.success) {
    res.status(400).json({ error: "Invalid source id" });
    return;
  }
  const access = await assertSourceAccess(sourceIdParsed.data, userId);
  if (!access) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  await setPrimarySource(access.projectId, access.source.id);
  res.json({ sourceId: access.source.id, isPrimary: true });
});

export default router;
