// Bundle renderer ("Ship Package") — Artifact Engine plug-in.
//
// Unlike other renderers, this one doesn't generate new content from an LLM —
// it packages a set of *already-generated* file-backed artifacts from the same
// project into a single downloadable zip. It still plugs into the Artifact
// Engine's standard render() contract so persistence/Ledger/download/reopen
// behavior is identical to every other artifact type.
import JSZip from "jszip";
import {
  registerArtifactRenderer,
  getFileBackedArtifact,
  type ArtifactRenderOutput,
} from "../artifactEngine";
import { ObjectStorageService, ObjectNotFoundError } from "../objectStorage";
import { logger } from "../logger";

const objectStorageService = new ObjectStorageService();

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
        if (!found) {
          skipped.push({ id: artifactId, reason: "not found or not file-backed" });
          continue;
        }
        const buffer = await fetchArtifactBuffer(found.objectPath);
        const fileName = safeFileName(found.row.title, found.extension, usedNames);
        zip.file(fileName, buffer);
        included.push({ id: found.row.id, title: found.row.title, type: found.row.type, fileName });
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
