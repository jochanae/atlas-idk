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
import { and, eq } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

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
}

export interface ArtifactRenderer<TInput = Record<string, unknown>> {
  /** Artifact type key, stored in project_artifacts.type (e.g. "docx"). */
  type: string;
  /** Grouping used by the Deliverables tab (Documents/Presentations/etc). */
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
  objectPath: string;
  ledgerEntryId: number | null;
  createdAt: string;
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

  const rendered = await renderer.render(input);
  const objectPath = await uploadRenderedFile(rendered.buffer, rendered.mimeType);

  const [row] = await db
    .insert(projectArtifactsTable)
    .values({
      projectId,
      type,
      version: await nextVersion(projectId, type),
      title: rendered.title,
      metadata: {
        source: "artifact-engine",
        category: renderer.category,
        mimeType: rendered.mimeType,
        extension: rendered.extension,
        objectPath,
        sizeBytes: rendered.buffer.byteLength,
        status: "generated",
      },
      payload: { preview: rendered.preview },
    })
    .returning();

  if (!row) throw new Error("Artifact engine: failed to persist artifact");

  let ledgerEntryId: number | null = null;
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
    ledgerEntryId = entry?.id ?? null;
  } catch (err) {
    logger.warn({ err, projectId, type }, "artifactEngine: ledger link failed — non-fatal");
  }

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
    objectPath,
    ledgerEntryId,
    createdAt: row.createdAt.toISOString(),
  };
}

async function nextVersion(projectId: number, type: string): Promise<number> {
  const existing = await db
    .select({ id: projectArtifactsTable.id })
    .from(projectArtifactsTable)
    .where(and(eq(projectArtifactsTable.projectId, projectId), eq(projectArtifactsTable.type, type)));
  return existing.length + 1;
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
