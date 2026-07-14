/**
 * Thumbnail Generator — builds lightweight SVG preview images for each
 * artifact type. Output is a base64-encoded SVG data URL suitable for
 * storing in metadata.thumbnailUrl and displaying as an <img> src.
 *
 * No external dependencies — pure SVG construction.
 */

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function toDataUrl(svg: string): string {
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

/** Determine whether a hex color is "dark" (lightness < 0.5). */
function isDark(hex: string): boolean {
  const h = hex.replace(/^#/, "");
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l < 0.5;
}

// ─── PPTX ────────────────────────────────────────────────────────────────────

export interface PptxThumbnailInput {
  title: string;
  subtitle?: string;
  theme?: string;
  themeBackground?: string;
  slideCount?: number;
  slideHeadings?: string[];
}

export function generatePptxThumbnail(preview: PptxThumbnailInput): string {
  const bg = preview.themeBackground ?? "#0f0e17";
  const dark = isDark(bg);
  const fg = dark ? "#ffffff" : "#0a0a0a";
  const fgMuted = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
  const accent = "#C9A24C";
  const title = truncate(preview.title ?? "Untitled", 42);
  const subtitle = truncate(preview.subtitle ?? preview.theme ?? "", 52);
  const slideCount = preview.slideCount ?? 0;
  const headings = (preview.slideHeadings ?? []).slice(0, 3);

  const headingRows = headings.map((h, i) =>
    `<text x="26" y="${135 + i * 13}" font-family="system-ui,sans-serif" font-size="8" fill="${fgMuted}">${esc(truncate(h, 36))}</text>`
  ).join("\n    ");

  const slideLabel = slideCount > 0 ? `${slideCount} slides` : "";

  const svg = `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
  <rect width="320" height="180" fill="${esc(bg)}" rx="0"/>
  <rect x="0" y="0" width="320" height="3" fill="${accent}"/>
  <rect x="0" y="0" width="3" height="180" fill="${accent}" opacity="0.25"/>
  <text x="26" y="60" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="${fg}" xml:space="preserve">${esc(truncate(title, 28))}</text>
  ${title.length > 28 ? `<text x="26" y="78" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="${fg}" xml:space="preserve">${esc(truncate(title.slice(28), 28))}</text>` : ""}
  ${subtitle ? `<text x="26" y="98" font-family="system-ui,sans-serif" font-size="9" fill="${fgMuted}">${esc(subtitle)}</text>` : ""}
  <line x1="26" y1="112" x2="294" y2="112" stroke="${accent}" stroke-width="0.5" opacity="0.3"/>
  ${headingRows}
  ${slideLabel ? `<text x="294" y="172" font-family="system-ui,sans-serif" font-size="8" fill="${fgMuted}" text-anchor="end">${esc(slideLabel)}</text>` : ""}
  <rect x="26" y="160" width="32" height="8" rx="2" fill="${accent}" opacity="0.18"/>
  <text x="42" y="167" font-family="system-ui,sans-serif" font-size="6.5" fill="${accent}" text-anchor="middle" font-weight="600">PPTX</text>
</svg>`;

  return toDataUrl(svg);
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

export interface PdfThumbnailInput {
  title: string;
  sectionHeadings?: string[];
  sectionCount?: number;
}

export function generatePdfThumbnail(preview: PdfThumbnailInput): string {
  const bg = "#1a0f0f";
  const accent = "#e57373";
  const fg = "#f5f0f0";
  const fgMuted = "rgba(245,240,240,0.45)";
  const title = truncate(preview.title ?? "Untitled", 38);
  const headings = (preview.sectionHeadings ?? []).slice(0, 5);

  const headingRows = headings.map((h, i) =>
    `<text x="22" y="${106 + i * 16}" font-family="system-ui,sans-serif" font-size="8.5" fill="${fgMuted}">${esc(truncate(h, 30))}</text>`
  ).join("\n    ");

  const svg = `<svg viewBox="0 0 220 310" xmlns="http://www.w3.org/2000/svg">
  <rect width="220" height="310" fill="${bg}" rx="0"/>
  <rect x="0" y="0" width="5" height="310" fill="${accent}"/>
  <rect x="0" y="0" width="220" height="3" fill="${accent}" opacity="0.4"/>
  <text x="22" y="52" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="${fg}" xml:space="preserve">${esc(truncate(title, 22))}</text>
  ${title.length > 22 ? `<text x="22" y="68" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="${fg}" xml:space="preserve">${esc(truncate(title.slice(22), 22))}</text>` : ""}
  <line x1="22" y1="84" x2="198" y2="84" stroke="${accent}" stroke-width="0.5" opacity="0.35"/>
  ${headingRows}
  <rect x="22" y="288" width="26" height="10" rx="2" fill="${accent}" opacity="0.2"/>
  <text x="35" y="296" font-family="system-ui,sans-serif" font-size="7" fill="${accent}" text-anchor="middle" font-weight="600">PDF</text>
</svg>`;

  return toDataUrl(svg);
}

// ─── DOCX ────────────────────────────────────────────────────────────────────

export interface DocxThumbnailInput {
  title: string;
  sectionHeadings?: string[];
}

export function generateDocxThumbnail(preview: DocxThumbnailInput): string {
  const bg = "#0d1523";
  const accent = "#5b9cf6";
  const fg = "#e8f0fe";
  const fgMuted = "rgba(232,240,254,0.45)";
  const title = truncate(preview.title ?? "Untitled", 38);
  const headings = (preview.sectionHeadings ?? []).slice(0, 5);

  const headingRows = headings.map((h, i) =>
    `<text x="22" y="${106 + i * 16}" font-family="system-ui,sans-serif" font-size="8.5" fill="${fgMuted}">${esc(truncate(h, 30))}</text>`
  ).join("\n    ");

  const svg = `<svg viewBox="0 0 220 310" xmlns="http://www.w3.org/2000/svg">
  <rect width="220" height="310" fill="${bg}" rx="0"/>
  <rect x="0" y="0" width="5" height="310" fill="${accent}"/>
  <rect x="0" y="0" width="220" height="3" fill="${accent}" opacity="0.4"/>
  <text x="22" y="52" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="${fg}" xml:space="preserve">${esc(truncate(title, 22))}</text>
  ${title.length > 22 ? `<text x="22" y="68" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="${fg}" xml:space="preserve">${esc(truncate(title.slice(22), 22))}</text>` : ""}
  <line x1="22" y1="84" x2="198" y2="84" stroke="${accent}" stroke-width="0.5" opacity="0.35"/>
  ${headingRows}
  <rect x="22" y="288" width="30" height="10" rx="2" fill="${accent}" opacity="0.2"/>
  <text x="37" y="296" font-family="system-ui,sans-serif" font-size="7" fill="${accent}" text-anchor="middle" font-weight="600">DOCX</text>
</svg>`;

  return toDataUrl(svg);
}

// ─── XLSX ────────────────────────────────────────────────────────────────────

export interface XlsxThumbnailInput {
  title: string;
  sheetCount?: number;
}

export function generateXlsxThumbnail(preview: XlsxThumbnailInput): string {
  const bg = "#0a1a0f";
  const accent = "#4caf72";
  const fg = "#e8f5ee";
  const fgMuted = "rgba(232,245,238,0.45)";
  const title = truncate(preview.title ?? "Untitled", 38);

  const gridCols = 4;
  const gridRows = 6;
  const cellW = 38;
  const cellH = 14;
  const startX = 22;
  const startY = 95;
  const cells: string[] = [];
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      cells.push(
        `<rect x="${startX + c * cellW}" y="${startY + r * cellH}" width="${cellW - 1}" height="${cellH - 1}" fill="${accent}" opacity="${r === 0 ? "0.18" : "0.07"}"/>`
      );
    }
  }

  const svg = `<svg viewBox="0 0 220 310" xmlns="http://www.w3.org/2000/svg">
  <rect width="220" height="310" fill="${bg}" rx="0"/>
  <rect x="0" y="0" width="5" height="310" fill="${accent}"/>
  <rect x="0" y="0" width="220" height="3" fill="${accent}" opacity="0.4"/>
  <text x="22" y="52" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="${fg}" xml:space="preserve">${esc(truncate(title, 22))}</text>
  ${title.length > 22 ? `<text x="22" y="68" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="${fg}" xml:space="preserve">${esc(truncate(title.slice(22), 22))}</text>` : ""}
  <line x1="22" y1="84" x2="198" y2="84" stroke="${accent}" stroke-width="0.5" opacity="0.35"/>
  ${cells.join("\n  ")}
  <rect x="22" y="288" width="30" height="10" rx="2" fill="${accent}" opacity="0.2"/>
  <text x="37" y="296" font-family="system-ui,sans-serif" font-size="7" fill="${accent}" text-anchor="middle" font-weight="600">XLSX</text>
  ${preview.sheetCount ? `<text x="198" y="296" font-family="system-ui,sans-serif" font-size="7" fill="${fgMuted}" text-anchor="end">${esc(String(preview.sheetCount))} sheet${preview.sheetCount !== 1 ? "s" : ""}</text>` : ""}
</svg>`;

  return toDataUrl(svg);
}

// ─── Generic dispatcher ───────────────────────────────────────────────────────

/**
 * Generate a thumbnail data URL for any artifact type.
 * Returns null when no thumbnail is applicable (e.g. draft text, markdown).
 */
export function generateThumbnail(
  type: string,
  extension: string,
  preview: Record<string, unknown>,
): string | null {
  const norm = (extension || type).toLowerCase();

  if (norm === "pptx" || type.includes("presentation")) {
    return generatePptxThumbnail(preview as unknown as PptxThumbnailInput);
  }
  if (norm === "pdf") {
    return generatePdfThumbnail(preview as unknown as PdfThumbnailInput);
  }
  if (norm === "docx" || norm === "doc") {
    return generateDocxThumbnail(preview as unknown as DocxThumbnailInput);
  }
  if (norm === "xlsx" || norm === "xls") {
    return generateXlsxThumbnail(preview as unknown as XlsxThumbnailInput);
  }

  return null;
}
