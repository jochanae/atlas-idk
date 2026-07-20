/**
 * PPTX send-turn extractor — text per slide + speaker notes.
 * Optionally rasterizes slides to PNG via LibreOffice (best-effort).
 */
import {
  entriesMatching,
  openOoxmlPackage,
  readEntryText,
  type OoxmlPackage,
} from "../../lib/verifiers/ooxmlUtils";
import { renderToImages } from "../../lib/renderToImages";
import { logger } from "../../lib/logger";
import {
  PPTX_SLIDE_CAP,
  EXTRACT_IMAGE_BLOCK_CAP,
  type AttachmentExtractResult,
} from "./types";
import { sortByTrailingNumber, xmlToLines } from "./xmlText";

const A_TEXT_RE = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g;

async function extractSlideText(pkg: OoxmlPackage, slidePath: string): Promise<string> {
  const xml = await readEntryText(pkg, slidePath);
  if (!xml) return "";
  return xmlToLines(xml, "</a:p>", A_TEXT_RE);
}

/**
 * Resolve speaker notes for a slide via its .rels Target, falling back to
 * notesSlideN.xml naming convention.
 */
async function extractNotesForSlide(
  pkg: OoxmlPackage,
  slidePath: string,
  slideIndex: number,
): Promise<string> {
  const slideNum = slidePath.match(/slide(\d+)\.xml$/i)?.[1] ?? String(slideIndex);
  const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
  const relsXml = await readEntryText(pkg, relsPath);

  let notesPath: string | null = null;
  if (relsXml) {
    const notesMatch = relsXml.match(
      /Target="([^"]*notesSlides\/notesSlide\d+\.xml)"/i,
    );
    if (notesMatch?.[1]) {
      const target = notesMatch[1].replace(/^\.\.\//, "");
      notesPath = target.startsWith("ppt/") ? target : `ppt/${target}`;
    }
  }
  if (!notesPath) {
    const candidate = `ppt/notesSlides/notesSlide${slideNum}.xml`;
    if (pkg.fileNames.includes(candidate)) notesPath = candidate;
  }
  if (!notesPath) return "";

  const notesXml = await readEntryText(pkg, notesPath);
  if (!notesXml) return "";
  // Speaker notes live in a:t runs; filter out the slide-number placeholder noise
  // by returning the full notes text — typically short.
  return xmlToLines(notesXml, "</a:p>", A_TEXT_RE);
}

async function maybeRasterizeSlides(
  buf: Buffer,
  maxImages: number,
): Promise<Buffer[]> {
  if (maxImages <= 0) return [];
  try {
    const rendered = await renderToImages(buf, "pptx");
    if (rendered.status !== "rendered" || rendered.pages.length === 0) {
      if (rendered.reason) {
        logger.info(
          { reason: rendered.reason },
          "attachmentExtract/pptx: slide rasterization skipped",
        );
      }
      return [];
    }
    return rendered.pages.slice(0, maxImages).map((p) => p.png);
  } catch (err) {
    logger.warn({ err }, "attachmentExtract/pptx: rasterization failed");
    return [];
  }
}

export async function extract(buf: Buffer): Promise<AttachmentExtractResult> {
  const pkg = await openOoxmlPackage(buf);
  const slideFiles = sortByTrailingNumber(
    entriesMatching(pkg, /^ppt\/slides\/slide\d+\.xml$/i),
  );

  if (slideFiles.length === 0) {
    throw new Error("PPTX contains 0 slides — treating as failed extraction");
  }

  const totalSlides = slideFiles.length;
  const capped = totalSlides > PPTX_SLIDE_CAP;
  const analyzed = slideFiles.slice(0, PPTX_SLIDE_CAP);
  const warnings: string[] = [];
  if (capped) {
    warnings.push(
      `deck too large — first ${PPTX_SLIDE_CAP} slides analyzed`,
    );
  }

  const parts: string[] = [];
  for (let i = 0; i < analyzed.length; i++) {
    const slidePath = analyzed[i]!;
    const text = await extractSlideText(pkg, slidePath);
    const notes = await extractNotesForSlide(pkg, slidePath, i + 1);
    const block: string[] = [`[Slide ${i + 1}]`];
    if (text.trim()) block.push(text);
    if (notes.trim()) block.push(`[Speaker notes]\n${notes}`);
    if (block.length > 1) parts.push(block.join("\n"));
  }

  if (parts.length === 0) {
    throw new Error("PPTX extraction returned no slide text");
  }

  if (capped) {
    parts.push(
      `\n[Note: deck has ${totalSlides} slides; only the first ${PPTX_SLIDE_CAP} were analyzed.]`,
    );
  }

  const images = await maybeRasterizeSlides(buf, EXTRACT_IMAGE_BLOCK_CAP);

  return {
    text: parts.join("\n\n"),
    ...(images.length > 0 ? { images } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
    stats: {
      slides: totalSlides,
      slidesAnalyzed: analyzed.length,
      truncated: capped,
    },
  };
}
