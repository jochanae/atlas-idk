// Artifact Engine — Phase 2A
//
// Shared pipeline for every file-backed deliverable Atlas produces (DOCX today;
// PPTX/XLSX/PDF/Mermaid/Charts/Drafts plug in later). A renderer owns only content
// generation + file rendering. The engine owns everything else: persistence,
// object storage, Ledger linkage, download, preview, and reopen behavior.
//
// Renderers register themselves via `registerArtifactRenderer` and are invoked by
// `generateArtifact`. This keeps every future format a plug-in instead of an
// independent system with its own persistence/Ledger/download code.
import { db, entriesTable, projectArtifactsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";
import { verifyArtifact, type VerificationResult } from "./verificationEngine";
import { runVisualQA, type VisualQAResult } from "./visualQAEngine";

const objectStorageService = new ObjectStorageService();

export type ArtifactCategory =
  | "document"
  | "presentation"
  | "spreadsheet"
  | "diagram"
  | "package"
  | "draft";

export interface ArtifactRenderOutput {
  /** File bytes to persist to object storage. */
  buffer: Buffer;
  /** Human-facing title for the artifact (used in the Ledger + listings). */
  title: string;
  /** MIME type of the rendered file. */
  mimeType: string;
  /** File extension without the dot, e.g. "docx". */
  extension: string;
  /** Lightweight preview payload — never the full file — shown inline without a download. */
  preview: Record<string, unknown>;
  /** Optional short summary used for the Ledger entry. */
  summary?: string;
  /**
   * Whether this artifact is safe to auto-render on the client without user
   * confirmation. Defaults to "generated" (auto-render). Renderers that detect
   * incomplete/unsafe output (e.g. htmlRenderer) set "needs_review" so the
   * client shows a "Ready to review — Render when you're ready" gate instead.
   */
  status?: "generated" | "needs_review";
  /**
   * Optional expected shape counts the renderer knows about ahead of render
   * (e.g. { slides: 8 }, { sections: 5 }, { sheets: 3 }). The verification
   * engine (F6A) diffs these against the actual rendered output to detect
   * truncation. Renderers that don't know a target shape can omit this.
   */
  expectedCounts?: Record<string, number>;
}

export interface ArtifactRenderer<TInput = Record<string, unknown>> {
  /** Artifact type key, stored in project_artifacts.type (e.g. "docx"). */
  type: string;
  /** Grouping used by Workspace → Outputs (Documents/Presentations/etc). */
  category: ArtifactCategory;
  /** Generates the file content for this artifact type. */
  render(input: TInput): Promise<ArtifactRenderOutput>;
}

const renderers = new Map<string, ArtifactRenderer<any>>();

export function registerArtifactRenderer(renderer: ArtifactRenderer<any>): void {
  renderers.set(renderer.type, renderer);
}

export function getArtifactRenderer(type: string): ArtifactRenderer<any> | undefined {
  return renderers.get(type);
}

export function listArtifactRendererTypes(): string[] {
  return Array.from(renderers.keys());
}

export interface GeneratedArtifact {
  id: number;
  projectId: number;
  type: string;
  category: ArtifactCategory;
  version: number;
  title: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  preview: Record<string, unknown>;
  /** Short human summary from the renderer (slide count, section count, etc.). */
  summary: string | null;
  status: "generated" | "needs_review";
  objectPath: string;
  ledgerEntryId: number | null;
  createdAt: string;
  /** F6A — result of the post-render verification pass, kept separate from `status` above. */
  verification: VerificationResult;
  /** F6B — additive visual QA pass; sibling of `verification`, not merged into it. */
  visualQA: VisualQAResult;
}

/**
 * Uploads a rendered file buffer to private object storage using the same
 * presigned-PUT flow the rest of the app uses for uploads, then returns the
 * normalized object path (e.g. "/objects/uploads/<uuid>") to persist.
 */
async function uploadRenderedFile(buffer: Buffer, mimeType: string): Promise<string> {
  const uploadURL = await objectStorageService.getObjectEntityUploadURL();
  const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: buffer,
    signal: AbortSignal.timeout(30_000),
  });
  if (!putRes.ok) {
    throw new Error(`Artifact engine: failed to store rendered file (status ${putRes.status})`);
  }
  return objectPath;
}

/**
 * Runs the full pipeline for one artifact: render → persist → object storage →
 * Ledger link. This is the single entry point every renderer plugs into — no
 * renderer should touch project_artifacts, object storage, or the Ledger directly.
 */
export async function generateArtifact<TInput>({
  projectId,
  sessionId = null,
  type,
  input,
  sourceMessageId = null,
}: {
  projectId: number;
  sessionId?: number | null;
  type: string;
  input: TInput;
  sourceMessageId?: number | null;
}): Promise<GeneratedArtifact> {
  const renderer = getArtifactRenderer(type);
  if (!renderer) {
    throw new Error(`Artifact engine: no renderer registered for type "${type}"`);
  }

  let rendered = await renderer.render(input);
  let objectPath = await uploadRenderedFile(rendered.buffer, rendered.mimeType);

  const row = await insertArtifactWithNextVersion({
    projectId,
    type,
    title: rendered.title,
    metadata: {
      source: "artifact-engine",
      category: renderer.category,
      mimeType: rendered.mimeType,
      extension: rendered.extension,
      objectPath,
      sizeBytes: rendered.buffer.byteLength,
      status: rendered.status ?? "generated",
    },
    payload: { preview: rendered.preview },
  });

  const ledgerEntryId = await linkLedgerEntry({ projectId, sessionId, sourceMessageId, type, rendered, renderer, row });

  // F6A — post-render verification. The artifact row and Ledger entry above
  // are never rolled back on a verification failure: nothing the user asked
  // for should silently disappear. A failed/needs-review result is instead
  // attached to the row's metadata so download/preview/reopen can surface it.
  let verification = await verifyArtifact({
    type,
    category: renderer.category,
    projectId,
    input,
    rendered,
    objectPath,
    rowPersisted: true,
    ledgerEntryId,
  });

  if (verification.status === "failed" && verification.retryable) {
    logger.warn(
      { projectId, type, failureClass: verification.failureClass },
      "artifactEngine: verification failed with a retryable failure class — retrying render once",
    );
    try {
      const retryRendered = await renderer.render(input);
      const retryObjectPath = await uploadRenderedFile(retryRendered.buffer, retryRendered.mimeType);
      const retryVerification = await verifyArtifact({
        type,
        category: renderer.category,
        projectId,
        input,
        rendered: retryRendered,
        objectPath: retryObjectPath,
        rowPersisted: true,
        ledgerEntryId,
      });
      rendered = retryRendered;
      objectPath = retryObjectPath;
      verification = retryVerification;
    } catch (err) {
      logger.warn({ err, projectId, type }, "artifactEngine: retry render threw — keeping original (failed) verification");
    }
  }

  // F6B — additive visual QA pass. Runs only for types with a registered
  // checker (see visualQACheckers/*); everything else reports "skipped".
  // Never allowed to affect artifact status/rollback — same non-fatal
  // posture as F6A's own persistence step below.
  const visualQA = await runVisualQA({
    type,
    buffer: rendered.buffer,
    input,
    preview: rendered.preview,
  }).catch((err) => {
    logger.warn({ err, projectId, type }, "artifactEngine: visual QA threw unexpectedly — treating as skipped");
    return {
      status: "skipped" as const,
      reason: err instanceof Error ? err.message : String(err),
      pagesChecked: 0,
      issues: [],
      checkedAt: new Date().toISOString(),
    } satisfies VisualQAResult;
  });

  await persistVerificationResult({ artifactId: row.id, rendered, objectPath, verification, visualQA });

  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    category: renderer.category,
    version: row.version,
    title: row.title,
    mimeType: rendered.mimeType,
    extension: rendered.extension,
    sizeBytes: rendered.buffer.byteLength,
    preview: rendered.preview,
    summary: rendered.summary ?? null,
    status: rendered.status ?? "generated",
    objectPath,
    ledgerEntryId,
    createdAt: row.createdAt.toISOString(),
    verification,
    visualQA,
  };
}

async function linkLedgerEntry(params: {
  projectId: number;
  sessionId: number | null;
  sourceMessageId: number | null;
  type: string;
  rendered: ArtifactRenderOutput;
  renderer: ArtifactRenderer<any>;
  row: typeof projectArtifactsTable.$inferSelect;
}): Promise<number | null> {
  const { projectId, sessionId, sourceMessageId, type, rendered, renderer, row } = params;
  try {
    const [entry] = await db
      .insert(entriesTable)
      .values({
        projectId,
        sessionId,
        type: "Decision",
        status: "committed",
        severity: "neutral",
        mode: "artifact-engine",
        title: rendered.title,
        summary: rendered.summary ?? `Generated ${renderer.category}: ${rendered.title}`,
        details: JSON.stringify({ preview: rendered.preview }),
        ...(sourceMessageId != null ? { sourceMessageId } : {}),
        enrichmentJson: JSON.stringify({
          artifactId: row.id,
          artifactType: type,
          artifactVersion: row.version,
          category: renderer.category,
        }),
      } as typeof entriesTable.$inferInsert)
      .returning({ id: entriesTable.id });
    return entry?.id ?? null;
  } catch (err) {
    logger.warn({ err, projectId, type }, "artifactEngine: ledger link failed — non-fatal");
    return null;
  }
}

/**
 * Persists the verification result (and, on a successful retry, the updated
 * objectPath/size/preview) onto the existing project_artifacts row. Never
 * throws — a failure to persist the verification result itself should not
 * fail the whole generateArtifact call, since the artifact and Ledger entry
 * are already real and usable.
 */
async function persistVerificationResult(params: {
  artifactId: number;
  rendered: ArtifactRenderOutput;
  objectPath: string;
  verification: VerificationResult;
  visualQA: VisualQAResult;
}): Promise<void> {
  try {
    const [existing] = await db
      .select({ metadata: projectArtifactsTable.metadata, payload: projectArtifactsTable.payload })
      .from(projectArtifactsTable)
      .where(eq(projectArtifactsTable.id, params.artifactId))
      .limit(1);
    const metadata = (existing?.metadata as Record<string, unknown>) ?? {};
    const payload = (existing?.payload as Record<string, unknown>) ?? {};
    await db
      .update(projectArtifactsTable)
      .set({
        metadata: {
          ...metadata,
          objectPath: params.objectPath,
          sizeBytes: params.rendered.buffer.byteLength,
          verification: { ...params.verification, visualQA: params.visualQA },
        },
        payload: { ...payload, preview: params.rendered.preview },
      })
      .where(eq(projectArtifactsTable.id, params.artifactId));
  } catch (err) {
    logger.warn({ err, artifactId: params.artifactId }, "artifactEngine: failed to persist verification result — non-fatal");
  }
}

/**
 * Inserts a new artifact row using MAX(version)+1 computed and inserted inside
 * the same transaction, retrying on unique-constraint races. This avoids the
 * duplicate-version bug of computing version from a separate "count rows" read
 * (wrong after deletions) or from a non-atomic read-then-insert (racy under
 * concurrent generates).
 */
async function insertArtifactWithNextVersion(values: {
  projectId: number;
  type: string;
  title: string;
  metadata: Record<string, unknown>;
  payload: Record<string, unknown>;
}): Promise<typeof projectArtifactsTable.$inferSelect> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [maxRow] = await tx
          .select({ maxV: sql<number>`COALESCE(MAX(${projectArtifactsTable.version}), 0)` })
          .from(projectArtifactsTable)
          .where(
            and(
              eq(projectArtifactsTable.projectId, values.projectId),
              eq(projectArtifactsTable.type, values.type),
            ),
          );
        const nextVersion = Number(maxRow?.maxV ?? 0) + 1;

        const [row] = await tx
          .insert(projectArtifactsTable)
          .values({ ...values, version: nextVersion })
          .returning();
        if (!row) throw new Error("Artifact engine: failed to persist artifact");
        return row;
      });
    } catch (err: unknown) {
      const isUniqueViolation = err instanceof Error && err.message.includes("project_artifacts_version_uniq");
      if (isUniqueViolation && attempt < maxAttempts) {
        logger.warn({ attempt, projectId: values.projectId, type: values.type }, "artifactEngine: version race — retrying");
        continue;
      }
      throw err;
    }
  }
  throw new Error("Artifact engine: failed to persist artifact after retries");
}

/**
 * Loads a previously generated artifact's stored metadata for download/preview,
 * asserting it belongs to the given project. Returns null if not found or if the
 * artifact was never file-backed (e.g. it's a legacy JSON-only artifact type).
 */
export async function getFileBackedArtifact(
  projectId: number,
  artifactId: number,
): Promise<{
  row: typeof projectArtifactsTable.$inferSelect;
  objectPath: string;
  mimeType: string;
  extension: string;
} | null> {
  const [row] = await db
    .select()
    .from(projectArtifactsTable)
    .where(and(eq(projectArtifactsTable.id, artifactId), eq(projectArtifactsTable.projectId, projectId)))
    .limit(1);

  if (!row) return null;

  const metadata = (row.metadata as Record<string, unknown>) ?? {};
  const objectPath = metadata.objectPath as string | undefined;
  if (!objectPath) return null;

  return {
    row,
    objectPath,
    mimeType: (metadata.mimeType as string | undefined) ?? "application/octet-stream",
    extension: (metadata.extension as string | undefined) ?? "bin",
  };
}
