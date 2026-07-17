// Flow Map exporters — professional formats for the Axiom Flow surface.
//
// Two categories:
//   • This surface  → PNG snapshot of the visible canvas
//   • All data      → JSON (structured model) or PDF (formatted report)
//
// All exporters expect the map's nodes plus optional readiness/project meta.

import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import type { ArchNode } from "@/components/AxiomFlow";

export interface FlowExportMeta {
  projectName?: string;
  readinessScore?: number | null;
  platform?: string;
}

function slugify(input: string): string {
  return (input || "axiom-flow")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "axiom-flow";
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function triggerDataUrlDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── PNG: snapshot of the current canvas ──────────────────────────────────────
export async function exportFlowSurfacePng(
  element: HTMLElement,
  meta: FlowExportMeta,
): Promise<void> {
  const bg =
    getComputedStyle(document.documentElement).getPropertyValue("--atlas-bg").trim() ||
    "#0a0a0a";
  const dataUrl = await toPng(element, {
    pixelRatio: 2,
    backgroundColor: bg,
    cacheBust: true,
    style: { transform: "none" },
  });
  const name = `${slugify(meta.projectName || "axiom-flow")}-${timestamp()}.png`;
  triggerDataUrlDownload(dataUrl, name);
}

// ── JSON: structured export of nodes + edges + meta ──────────────────────────
export function exportFlowJson(
  nodes: ArchNode[],
  meta: FlowExportMeta,
): void {
  const payload = {
    format: "axiom-flow-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    project: {
      name: meta.projectName ?? null,
      platform: meta.platform ?? null,
      readinessScore: meta.readinessScore ?? null,
    },
    counts: {
      nodes: nodes.length,
      resolved: nodes.filter((n) => n.resolved).length,
      defined: nodes.filter((n) => !!n.strategicAnswer?.trim()).length,
    },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      resolved: n.resolved,
      meta: n.meta ?? null,
      moscow: n.moscow ?? null,
      details: n.details ?? null,
      question: n.question ?? null,
      strategicAnswer: n.strategicAnswer ?? null,
      confidence: n.confidence ?? null,
      reasons: n.reasons ?? null,
      position: { x: n.x, y: n.y },
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  triggerBlobDownload(blob, `${slugify(meta.projectName || "axiom-flow")}-${timestamp()}.json`);
}

// ── PDF: formatted report of the full map + drill-down node data ─────────────
const TYPE_LABEL: Record<ArchNode["type"], string> = {
  goal: "Goal",
  requirement: "Requirement",
  blocker: "Blocker",
  priority: "Priority",
  decision: "Decision",
  sprint: "Sprint",
  wont: "Won't",
};

export function exportFlowPdf(nodes: ArchNode[], meta: FlowExportMeta): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 54;
  const marginTop = 60;
  const marginBottom = 54;
  const contentWidth = pageWidth - marginX * 2;
  let y = marginTop;

  const ensureRoom = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  const setText = (size: number, weight: "normal" | "bold" = "normal", color: [number, number, number] = [24, 24, 24]) => {
    doc.setFont("helvetica", weight);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
  };

  const writeParagraph = (
    text: string,
    opts: { size?: number; weight?: "normal" | "bold"; color?: [number, number, number]; leading?: number; gapAfter?: number } = {},
  ) => {
    const size = opts.size ?? 10.5;
    const leading = opts.leading ?? size * 1.35;
    setText(size, opts.weight ?? "normal", opts.color ?? [40, 40, 40]);
    const lines = doc.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      ensureRoom(leading);
      doc.text(line, marginX, y);
      y += leading;
    }
    y += opts.gapAfter ?? 0;
  };

  const rule = (opacity = 0.15) => {
    ensureRoom(12);
    const gray = Math.round(255 * (1 - opacity));
    doc.setDrawColor(gray, gray, gray);
    doc.setLineWidth(0.5);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 14;
  };

  // ── Cover header ───────────────────────────────────────────────────────────
  setText(9, "bold", [140, 108, 40]);
  doc.text("AXIOM FLOW · EXPORT", marginX, y);
  y += 20;
  setText(22, "bold", [22, 22, 22]);
  doc.text(meta.projectName || "Untitled Project", marginX, y);
  y += 26;

  setText(10, "normal", [110, 110, 110]);
  const readiness =
    typeof meta.readinessScore === "number" ? `${meta.readinessScore}% ready` : "readiness unknown";
  const platform = meta.platform ? ` · ${meta.platform}` : "";
  doc.text(`${readiness}${platform} · exported ${new Date().toLocaleString()}`, marginX, y);
  y += 22;
  rule(0.2);

  // ── Summary counts ─────────────────────────────────────────────────────────
  const total = nodes.length;
  const resolved = nodes.filter((n) => n.resolved).length;
  const defined = nodes.filter((n) => !!n.strategicAnswer?.trim()).length;

  setText(11, "bold", [30, 30, 30]);
  doc.text("Overview", marginX, y);
  y += 16;
  writeParagraph(
    `${total} node${total === 1 ? "" : "s"} on the map. ${defined} defined, ${resolved} resolved.`,
    { size: 10.5, color: [60, 60, 60], gapAfter: 6 },
  );

  // Group by type
  const grouped = new Map<ArchNode["type"], ArchNode[]>();
  for (const n of nodes) {
    if (!grouped.has(n.type)) grouped.set(n.type, []);
    grouped.get(n.type)!.push(n);
  }
  const typeOrder: ArchNode["type"][] = [
    "goal",
    "requirement",
    "priority",
    "decision",
    "blocker",
    "sprint",
    "wont",
  ];

  const breakdown = typeOrder
    .filter((t) => grouped.has(t))
    .map((t) => `${TYPE_LABEL[t]}: ${grouped.get(t)!.length}`)
    .join("  ·  ");
  if (breakdown) {
    writeParagraph(breakdown, { size: 9.5, color: [110, 110, 110], gapAfter: 12 });
  }
  rule(0.12);

  // ── Node detail sections ───────────────────────────────────────────────────
  for (const t of typeOrder) {
    const group = grouped.get(t);
    if (!group || group.length === 0) continue;

    ensureRoom(40);
    setText(13, "bold", [140, 108, 40]);
    doc.text(TYPE_LABEL[t].toUpperCase(), marginX, y);
    y += 18;

    for (const node of group) {
      ensureRoom(30);
      // Node title row
      setText(11.5, "bold", [22, 22, 22]);
      const label = node.label || "(untitled)";
      const labelLines = doc.splitTextToSize(label, contentWidth - 90);
      for (let i = 0; i < labelLines.length; i++) {
        ensureRoom(15);
        doc.text(labelLines[i], marginX, y);
        if (i === 0) {
          // right-side status pill text
          const status = node.resolved ? "RESOLVED" : node.strategicAnswer?.trim() ? "DEFINED" : "OPEN";
          setText(8.5, "bold", node.resolved ? [64, 130, 78] : node.strategicAnswer?.trim() ? [140, 108, 40] : [150, 90, 90]);
          doc.text(status, pageWidth - marginX, y, { align: "right" });
          setText(11.5, "bold", [22, 22, 22]);
        }
        y += 15;
      }

      // Meta line
      const metaBits: string[] = [];
      if (node.meta) metaBits.push(`MoSCoW: ${node.meta}`);
      if (typeof node.confidence === "number") {
        const c = node.confidence <= 1 ? Math.round(node.confidence * 100) : Math.round(node.confidence);
        metaBits.push(`Confidence: ${c}%`);
      }
      if (metaBits.length) {
        writeParagraph(metaBits.join("  ·  "), { size: 9, color: [130, 130, 130], gapAfter: 2 });
      }

      if (node.question) {
        writeParagraph(`Q: ${node.question}`, { size: 10, color: [80, 80, 80], gapAfter: 2 });
      }
      if (node.strategicAnswer) {
        writeParagraph(node.strategicAnswer, { size: 10.5, color: [40, 40, 40], gapAfter: 4 });
      }
      if (node.details) {
        writeParagraph(node.details, { size: 10, color: [70, 70, 70], gapAfter: 4 });
      }
      if (node.reasons && node.reasons.length) {
        for (const r of node.reasons) {
          writeParagraph(`•  ${r}`, { size: 9.5, color: [95, 95, 95], leading: 13, gapAfter: 0 });
        }
      }
      y += 8;
    }
    y += 4;
    rule(0.1);
  }

  // ── Footer on every page ───────────────────────────────────────────────────
  const total_pages = doc.getNumberOfPages();
  for (let p = 1; p <= total_pages; p++) {
    doc.setPage(p);
    setText(8, "normal", [150, 150, 150]);
    doc.text(
      `Axiom Flow · ${meta.projectName || "Export"}`,
      marginX,
      pageHeight - 28,
    );
    doc.text(`${p} / ${total_pages}`, pageWidth - marginX, pageHeight - 28, {
      align: "right",
    });
  }

  doc.save(`${slugify(meta.projectName || "axiom-flow")}-${timestamp()}.pdf`);
}
