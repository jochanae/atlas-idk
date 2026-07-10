// Shared OOXML (zip-based Office format) structural parsing helpers used by
// the PPTX/DOCX/XLSX verifiers. Real package inspection, not signature checks:
// opens the zip, confirms the parts every OOXML package must have, and lets
// each format-specific verifier drill into its own required parts.
import JSZip from "jszip";

export interface OoxmlPackage {
  zip: JSZip;
  fileNames: string[];
}

/**
 * Opens the buffer as a zip and confirms it's a real OOXML package —
 * [Content_Types].xml is mandatory in every OOXML format (pptx/docx/xlsx).
 * Throws with a descriptive reason on failure so callers can surface it as a
 * failed VerificationCheck.
 */
export async function openOoxmlPackage(buffer: Buffer): Promise<OoxmlPackage> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err) {
    throw new Error(
      `File is not a valid zip/OOXML package: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }
  const fileNames = Object.keys(zip.files);
  if (!fileNames.includes("[Content_Types].xml")) {
    throw new Error("Missing [Content_Types].xml — not a valid OOXML package.");
  }
  return { zip, fileNames };
}

export async function readEntryText(pkg: OoxmlPackage, path: string): Promise<string | null> {
  const entry = pkg.zip.file(path);
  if (!entry) return null;
  return entry.async("string");
}

export function entriesMatching(pkg: OoxmlPackage, pattern: RegExp): string[] {
  return pkg.fileNames.filter((f) => pattern.test(f));
}
