// Bundle renderer ("Ship Package") — Artifact Engine plug-in.
//
// Unlike other renderers, this one doesn't generate new content from an LLM —
// it packages a set of *already-generated* file-backed artifacts from the same
// project into a single downloadable zip. It still plugs into the Artifact
// Engine's standard render() contract so persistence/Ledger/download/reopen
// behavior is identical to every other artifact type.
import JSZip from "jszip";
import { db, projectArtifactsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  registerArtifactRenderer,
  getFileBackedArtifact,
  type ArtifactRenderOutput,
} from "../artifactEngine";
import { ObjectStorageService, ObjectNotFoundError } from "../objectStorage";
import { DECISION_ARTIFACT_TYPES } from "../decisionArtifacts";
import { logger } from "../logger";

const objectStorageService = new ObjectStorageService();
const DECISION_TYPES = new Set<string>(DECISION_ARTIFACT_TYPES);

export interface BundleRendererInput {
  /** Project the source artifacts belong to (bundling is always within one project). */
  projectId: number;
  /** Ids of existing file-backed project_artifacts rows to include in the bundle. */
  artifactIds: number[];
  /** Optional human title, e.g. "Sprint 4 Ship Package". Defaults to a generated one. */
  title?: string;
}

async function fetchArtifactBuffer(objectPath: string): Promise<Buffer> {
  const file = await objectStorageService.getObjectEntityFile(objectPath);
  const response = await objectStorageService.downloadObject(file);
  if (!response.body) return Buffer.alloc(0);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function safeFileName(title: string, extension: string, usedNames: Set<string>): string {
  const base = title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "artifact";
  let candidate = `${base}.${extension}`;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${base} (${suffix}).${extension}`;
    suffix++;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

async function fetchRawArtifactRow(
  projectId: number,
  artifactId: number,
): Promise<typeof projectArtifactsTable.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(projectArtifactsTable)
    .where(and(eq(projectArtifactsTable.id, artifactId), eq(projectArtifactsTable.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

/**
 * Decision intelligence artifacts (tradeoff_matrix / decision_tree / deviation_log)
 * are persisted as JSON payload rows with no backing file in object storage —
 * they're generated inline, not through the Artifact Engine. To include them in a
 * Ship Package, materialize a readable Markdown export of the payload on the fly.
 */
function decisionArtifactToMarkdown(row: typeof projectArtifactsTable.$inferSelect): Buffer {
  const payload = (row.payload as Record<string, unknown>) ?? {};
  const lines: string[] = [`# ${row.title}`, ""];
  lines.push("```json");
  lines.push(JSON.stringify(payload, null, 2));
  lines.push("```");
  return Buffer.from(lines.join("\n"), "utf-8");
}

registerArtifactRenderer({
  type: "bundle",
  category: "package",
  async render(input: BundleRendererInput): Promise<ArtifactRenderOutput> {
    const { projectId, artifactIds } = input;

    if (!projectId || !Array.isArray(artifactIds) || artifactIds.length === 0) {
      throw new Error("Bundle renderer: projectId and at least one artifactId are required");
    }

    const zip = new JSZip();
    const usedNames = new Set<string>();
    const included: Array<{ id: number; title: string; type: string; fileName: string }> = [];
    const skipped: Array<{ id: number; reason: string }> = [];

    for (const artifactId of artifactIds) {
      try {
        const found = await getFileBackedArtifact(projectId, artifactId);
        if (found) {
          const buffer = await fetchArtifactBuffer(found.objectPath);
          const fileName = safeFileName(found.row.title, found.extension, usedNames);
          zip.file(fileName, buffer);
          included.push({ id: found.row.id, title: found.row.title, type: found.row.type, fileName });
          continue;
        }

        // Not file-backed — check if it's a decision intelligence artifact
        // (tradeoff_matrix / decision_tree / deviation_log), which is persisted
        // as a JSON payload rather than an object-storage file. Materialize a
        // Markdown export on the fly so milestone bundles can still include them.
        const row = await fetchRawArtifactRow(projectId, artifactId);
        if (row && DECISION_TYPES.has(row.type)) {
          const buffer = decisionArtifactToMarkdown(row);
          const fileName = safeFileName(row.title, "md", usedNames);
          zip.file(fileName, buffer);
          included.push({ id: row.id, title: row.title, type: row.type, fileName });
          continue;
        }

        skipped.push({ id: artifactId, reason: "not found or not bundleable" });
      } catch (err) {
        if (err instanceof ObjectNotFoundError) {
          skipped.push({ id: artifactId, reason: "file missing in storage" });
        } else {
          logger.warn({ err, artifactId, projectId }, "bundleRenderer: failed to fetch source artifact — skipping");
          skipped.push({ id: artifactId, reason: "failed to fetch" });
        }
      }
    }

    if (included.length === 0) {
      throw new Error("Bundle renderer: none of the requested artifacts could be included");
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    const title = input.title?.trim() || `Ship Package — ${new Date().toISOString().slice(0, 10)}`;

    return {
      buffer,
      title,
      mimeType: "application/zip",
      extension: "zip",
      preview: {
        fileCount: included.length,
        files: included.map((f) => ({ id: f.id, title: f.title, type: f.type, fileName: f.fileName })),
        skipped: skipped.length > 0 ? skipped : undefined,
      },
      summary: `Bundled ${included.length} artifact${included.length === 1 ? "" : "s"} into ${title}${
        skipped.length > 0 ? ` (${skipped.length} skipped)` : ""
      }.`,
    };
  },
});
