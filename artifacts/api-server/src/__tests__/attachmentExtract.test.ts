import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import {
  applyExtractedTextByteCap,
  extractAttachment,
  PPTX_SLIDE_CAP,
} from "../services/attachmentExtract";

vi.mock("../lib/renderToImages", () => ({
  renderToImages: vi.fn(async () => ({
    status: "unavailable" as const,
    pages: [],
    reason: "test stub — no soffice",
  })),
}));

async function buildMinimalPptx(slideTexts: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types></Types>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation/>`);
  slideTexts.forEach((text, i) => {
    const n = i + 1;
    zip.file(
      `ppt/slides/slide${n}.xml`,
      `<?xml version="1.0"?>
      <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:cSld><p:spTree>
          <p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>
        </p:spTree></p:cSld>
      </p:sld>`,
    );
  });
  // Speaker notes on slide 1
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<?xml version="1.0"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Target="../notesSlides/notesSlide1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide"/>
    </Relationships>`,
  );
  zip.file(
    "ppt/notesSlides/notesSlide1.xml",
    `<?xml version="1.0"?>
    <p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree>
        <p:sp><p:txBody><a:p><a:r><a:t>Remember the roadmap</a:t></a:r></a:p></p:txBody></p:sp>
      </p:spTree></p:cSld>
    </p:notes>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildMinimalDocx(paragraphs: Array<{ text: string; style?: string }>): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types></Types>`);
  const body = paragraphs
    .map((p) => {
      const style = p.style
        ? `<w:pPr><w:pStyle w:val="${p.style}"/></w:pPr>`
        : "";
      return `<w:p>${style}<w:r><w:t>${p.text}</w:t></w:r></w:p>`;
    })
    .join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>${body}</w:body>
    </w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildMinimalXlsx(rows: string[][]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types></Types>`);
  const unique = [...new Set(rows.flat())];
  const shared = unique
    .map((s) => `<si><t>${s}</t></si>`)
    .join("");
  zip.file(
    "xl/sharedStrings.xml",
    `<?xml version="1.0"?><sst>${shared}</sst>`,
  );
  const indexOf = (s: string) => unique.indexOf(s);
  const sheetRows = rows
    .map(
      (r, ri) =>
        `<row r="${ri + 1}">${r
          .map(
            (c, ci) =>
              `<c r="${String.fromCharCode(65 + ci)}${ri + 1}" t="s"><v>${indexOf(c)}</v></c>`,
          )
          .join("")}</row>`,
    )
    .join("");
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("attachmentExtract service", () => {
  it("extracts PPTX slide text and speaker notes", async () => {
    const buf = await buildMinimalPptx([
      "Q3 Strategy",
      "Growth levers",
      "Risks",
    ]);
    const result = await extractAttachment(
      buf,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "deck.pptx",
    );
    expect(result.text).toContain("[Slide 1]");
    expect(result.text).toContain("Q3 Strategy");
    expect(result.text).toContain("Growth levers");
    expect(result.text).toContain("[Speaker notes]");
    expect(result.text).toContain("Remember the roadmap");
    expect(result.stats?.slides).toBe(3);
    expect(result.stats?.slidesAnalyzed).toBe(3);
  });

  it("caps oversized PPTX and warns with deck-too-large reason", async () => {
    const slides = Array.from({ length: PPTX_SLIDE_CAP + 5 }, (_, i) => `Slide ${i + 1} title`);
    const buf = await buildMinimalPptx(slides);
    const result = await extractAttachment(
      buf,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "huge.pptx",
    );
    expect(result.stats?.slides).toBe(PPTX_SLIDE_CAP + 5);
    expect(result.stats?.slidesAnalyzed).toBe(PPTX_SLIDE_CAP);
    expect(result.stats?.truncated).toBe(true);
    expect(result.warnings).toContain(
      `deck too large — first ${PPTX_SLIDE_CAP} slides analyzed`,
    );
    expect(result.text).toContain(`[Slide ${PPTX_SLIDE_CAP}]`);
    expect(result.text).not.toContain(`[Slide ${PPTX_SLIDE_CAP + 1}]`);
  });

  it("fails PPTX with zero slides", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types></Types>`);
    zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation/>`);
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    await expect(
      extractAttachment(
        buf,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "empty.pptx",
      ),
    ).rejects.toThrow(/0 slides/i);
  });

  it("extracts DOCX headings by name", async () => {
    const buf = await buildMinimalDocx([
      { text: "Launch Plan", style: "Heading1" },
      { text: "We ship Friday." },
      { text: "Risks", style: "Heading2" },
    ]);
    const result = await extractAttachment(
      buf,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "plan.docx",
    );
    expect(result.text).toContain("# Launch Plan");
    expect(result.text).toContain("## Risks");
    expect(result.text).toContain("We ship Friday.");
  });

  it("extracts XLSX as markdown table", async () => {
    const buf = await buildMinimalXlsx([
      ["Name", "Score"],
      ["Ada", "10"],
      ["Grace", "9"],
    ]);
    const result = await extractAttachment(
      buf,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "scores.xlsx",
    );
    expect(result.text).toContain("[Sheet 1]");
    expect(result.text).toContain("| Name | Score |");
    expect(result.text).toContain("| Ada | 10 |");
  });

  it("extracts CSV as markdown table", async () => {
    const csv = Buffer.from("city,pop\nParis,100\nLyon,50\n", "utf8");
    const result = await extractAttachment(csv, "text/csv", "cities.csv");
    expect(result.text).toContain("| city | pop |");
    expect(result.text).toContain("| Paris | 100 |");
  });

  it("truncates longest extracted text first under byte cap", () => {
    const long = "x".repeat(1000);
    const short = "short";
    const { texts, truncatedNames } = applyExtractedTextByteCap(
      [
        { name: "long.txt", text: long },
        { name: "short.txt", text: short },
      ],
      200,
    );
    expect(truncatedNames).toEqual(["long.txt"]);
    expect(truncatedNames).not.toContain("short.txt");
    expect(texts[1]).toBe("short");
    expect(texts[0]).toContain("[truncated");
    const total = texts.reduce((n, t) => n + Buffer.byteLength(t, "utf8"), 0);
    expect(total).toBeLessThanOrEqual(200);
  });
});
