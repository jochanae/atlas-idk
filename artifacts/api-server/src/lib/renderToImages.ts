// Headless render pipeline — F6B Stage 1.
//
// Converts a file-backed deliverable (PPTX, PDF, ...) into one PNG buffer per
// page/slide, with no manual intervention. This is the shared substrate every
// F6B visual QA checker renders against — checkers should never shell out to
// soffice/pdftoppm themselves.
//
// Pipeline: PPTX/DOCX/XLSX -> (soffice --headless --convert-to pdf) -> PDF
//           PDF -> (pdftoppm -png) -> PNG per page
//
// Both `soffice` and `pdftoppm` are Nix-provided system binaries (chromium
// and libreoffice were installed for this task; pdftoppm/pdftocairo ship
// with the base Replit runtime). Everything happens in a scratch temp dir
// that is always cleaned up, even on failure.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

const SOFFICE_TIMEOUT_MS = 60_000;
const PDFTOPPM_TIMEOUT_MS = 30_000;

/** Formats this pipeline knows how to rasterize. Extend deliberately, not implicitly. */
export type RenderableFormat = "pptx" | "pdf" | "docx" | "xlsx";

export interface RenderedPage {
  index: number;
  png: Buffer;
}

export interface RenderToImagesResult {
  status: "rendered" | "unavailable" | "failed";
  pages: RenderedPage[];
  /** Set when status !== "rendered" — always populated, never a silent skip. */
  reason?: string;
}

async function convertToPdf(buffer: Buffer, extension: string, workDir: string): Promise<Buffer> {
  const inputPath = path.join(workDir, `input.${extension}`);
  await writeFile(inputPath, buffer);

  const sofficeBin = process.env.SOFFICE_PATH || "soffice";
  await execFileAsync(
    sofficeBin,
    ["--headless", "--norestore", "--convert-to", "pdf", "--outdir", workDir, inputPath],
    { timeout: SOFFICE_TIMEOUT_MS, env: { ...process.env, HOME: workDir } },
  );

  const outputPath = path.join(workDir, "input.pdf");
  return readFile(outputPath);
}

async function rasterizePdf(pdfBuffer: Buffer, workDir: string): Promise<RenderedPage[]> {
  const pdfPath = path.join(workDir, "source.pdf");
  await writeFile(pdfPath, pdfBuffer);

  const outPrefix = path.join(workDir, "page");
  const pdftoppmBin = process.env.PDFTOPPM_PATH || "pdftoppm";
  // -r 110: high enough DPI to catch overflow/clipping without producing huge files.
  await execFileAsync(pdftoppmBin, ["-png", "-r", "110", pdfPath, outPrefix], {
    timeout: PDFTOPPM_TIMEOUT_MS,
  });

  const files = (await readdir(workDir))
    .filter((f) => f.startsWith("page") && f.endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const pages: RenderedPage[] = [];
  for (let i = 0; i < files.length; i++) {
    pages.push({ index: i, png: await readFile(path.join(workDir, files[i])) });
  }
  return pages;
}

/**
 * Renders every page/slide of a file-backed deliverable to PNG.
 * Never throws — a broken toolchain is reported as `status: "unavailable"`
 * (visual QA is additive to F6A, so its own absence must never fail the
 * artifact pipeline) and a genuinely bad file is reported as `"failed"`.
 *
 * Note on "xlsx": LibreOffice paginates a workbook per its built-in print
 * area/page-break rules, not per-sheet, so the resulting PNG count does not
 * map 1:1 onto worksheet count. Callers must treat xlsx pages as "whatever
 * LibreOffice decided to print" — best-effort, not a per-sheet guarantee.
 */
export async function renderToImages(
  buffer: Buffer,
  format: RenderableFormat,
): Promise<RenderToImagesResult> {
  let workDir: string | null = null;
  try {
    workDir = await mkdtemp(path.join(tmpdir(), "atlas-visual-qa-"));

    const pdfBuffer = format === "pdf" ? buffer : await convertToPdf(buffer, format, workDir);
    const pages = await rasterizePdf(pdfBuffer, workDir);

    if (pages.length === 0) {
      return { status: "failed", pages: [], reason: "Rasterization produced zero pages." };
    }
    return { status: "rendered", pages };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const looksLikeMissingBinary = /ENOENT|command not found/i.test(message);
    logger.warn({ err: message, format }, "renderToImages: headless render failed");
    return {
      status: looksLikeMissingBinary ? "unavailable" : "failed",
      pages: [],
      reason: looksLikeMissingBinary
        ? `Headless render toolchain unavailable in this environment: ${message}`
        : `Failed to rasterize ${format}: ${message}`,
    };
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
