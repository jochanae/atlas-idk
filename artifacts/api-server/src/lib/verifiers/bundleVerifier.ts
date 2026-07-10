// Bundle ("Ship Package") verifier — F6A Stage 3.
// A bundle's own zip integrity is not enough: this verifier confirms every
// artifact the bundle *claims* to include (from preview.files) both exists
// in the zip AND is independently verified in its own project_artifacts row
// — a bundle should never look "complete" while quietly packaging a
// corrupted or unverified source artifact.
import JSZip from "jszip";
import { db, projectArtifactsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { registerArtifactVerifier, type VerificationCheck } from "../verificationEngine";

interface BundlePreviewFile {
  id: number;
  title: string;
  type: string;
  fileName: string;
}

registerArtifactVerifier({
  type: "bundle",
  async verify({ buffer, rendered }): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch (err) {
      checks.push({
        key: "bundle-zip-opens",
        pass: false,
        reason: err instanceof Error ? err.message : "Failed to open bundle zip.",
      });
      return checks;
    }
    checks.push({ key: "bundle-zip-opens", pass: true });

    const preview = (rendered.preview ?? {}) as { files?: BundlePreviewFile[] };
    const promisedFiles = preview.files ?? [];

    if (promisedFiles.length === 0) {
      checks.push({
        key: "bundle-has-promised-files",
        pass: false,
        reason: "Bundle preview declares no included files to verify against.",
      });
      return checks;
    }
    checks.push({ key: "bundle-has-promised-files", pass: true });

    const zipEntryNames = new Set(Object.keys(zip.files));
    const missingFromZip = promisedFiles.filter((f) => !zipEntryNames.has(f.fileName));
    checks.push({
      key: "bundle-all-files-present-in-zip",
      pass: missingFromZip.length === 0,
      ...(missingFromZip.length === 0
        ? {}
        : {
            reason: `Bundle claims to include ${missingFromZip
              .map((f) => `"${f.fileName}"`)
              .join(", ")} but the file is missing from the zip.`,
          }),
    });

    const unverified: string[] = [];
    const notFound: string[] = [];
    for (const file of promisedFiles) {
      const [row] = await db
        .select({ metadata: projectArtifactsTable.metadata })
        .from(projectArtifactsTable)
        .where(eq(projectArtifactsTable.id, file.id))
        .limit(1);
      if (!row) {
        notFound.push(file.title);
        continue;
      }
      const metadata = (row.metadata as Record<string, unknown>) ?? {};
      const verification = metadata.verification as { status?: string } | undefined;
      // Decision-intelligence artifacts (materialized inline as Markdown, not
      // through the Artifact Engine) never go through verifyArtifact — they
      // have no verification record by design, so absence isn't a failure.
      const isDecisionArtifact = !("verification" in metadata) && !metadata.objectPath;
      if (isDecisionArtifact) continue;
      if (verification?.status !== "verified") {
        unverified.push(`${file.title} (${verification?.status ?? "no record"})`);
      }
    }

    checks.push({
      key: "bundle-source-artifacts-exist",
      pass: notFound.length === 0,
      ...(notFound.length === 0
        ? {}
        : { reason: `Source artifact row(s) no longer exist: ${notFound.join(", ")}.` }),
    });

    checks.push({
      key: "bundle-source-artifacts-independently-verified",
      pass: unverified.length === 0,
      ...(unverified.length === 0
        ? {}
        : {
            reason: `Bundle includes artifact(s) that are not independently verified: ${unverified.join(", ")}.`,
          }),
    });

    return checks;
  },
});
