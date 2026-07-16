// HTML App renderer — generates a complete self-contained web app from conversation context.
// Uses Claude to produce an interactive, visually polished single-file HTML/CSS/JS application.
// Registered with the Artifact Engine as type "html-app" so generate_deliverable can invoke it.
import Anthropic from "@anthropic-ai/sdk";
import { registerArtifactRenderer, type ArtifactRenderOutput } from "../artifactEngine";
import { logger } from "../logger";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface DesignContract {
  tone?: string[];
  theme?: { mode?: string; background?: string; style?: string };
  components?: { cards?: string; icons?: string };
  palette?: { primary?: string; bg?: string; accent?: string };
  prohibited?: string[];
  contentRules?: { notes?: string; activityCount?: number; activities?: string[] };
  sourcePrompt?: string;
}

export interface HtmlAppInput {
  context: string;
  title?: string;
  docType?: string;
  projectId?: number;
  styleOverride?: string;
  /** Optional stage reporter called as the renderer progresses through phases. */
  onStage?: (stage: "building" | "styling" | "checking") => void;
}

export interface ValidationResult {
  issues: string[];
  tileCount: number;
  duplicateTitles: string[];
  checkedAt: string;
}

const BASE_SYSTEM_PROMPT = `You are an expert frontend developer. Generate a complete, self-contained, production-quality HTML web application based on the conversation context.

Rules:
- Output a single HTML file with all CSS and JavaScript embedded inline — no external files, no build step required
- Allowed CDN sources: cdn.tailwindcss.com, unpkg.com, cdnjs.cloudflare.com, fonts.googleapis.com, fonts.gstatic.com
- The result must be immediately functional when pasted into a browser — no placeholders, no TODOs
- Match the exact visual style, features, and requirements described in the conversation
- Produce the most polished, complete version you can within one file
- Begin with <!DOCTYPE html> and include a complete valid HTML document structure

Responsiveness (REQUIRED — the preview frame may be as narrow as ~360px or as wide as 1440px+):
- Include <meta name="viewport" content="width=device-width, initial-scale=1.0" /> in <head>
- Mobile-first: layouts must render cleanly from ~360px up through desktop widths — never assume a fixed desktop canvas
- Use fluid units (%, rem, clamp(), minmax, flex/grid) — avoid fixed pixel widths on top-level containers
- Never set body/html to a fixed width; no horizontal overflow at any viewport
- Media (img, video, svg, iframe): max-width: 100%; height: auto
- Long text (URLs, code, tokens) must wrap — use overflow-wrap: anywhere / word-break where needed
- Tables and wide content: wrap in an overflow-x: auto container so they scroll internally instead of blowing out the page
- Use responsive breakpoints (Tailwind sm/md/lg or media queries) for multi-column layouts; collapse to a single column on small screens
- Touch targets: min 40px tap height for interactive elements

Output ONLY the raw HTML. No markdown fences, no explanations, no preamble.`;

function buildSystemPrompt(contract: DesignContract | null): string {
  if (!contract) return BASE_SYSTEM_PROMPT;

  const lines: string[] = [BASE_SYSTEM_PROMPT, "", "═══ PROJECT DESIGN CONTRACT (MANDATORY — MUST FOLLOW) ═══"];

  if (contract.theme) {
    const t = contract.theme;
    if (t.mode) lines.push(`- Color mode: ${t.mode} — NEVER use a ${t.mode === "dark" ? "white or light" : "dark"} background`);
    if (t.background) lines.push(`- Background: ${t.background}`);
    if (t.style) lines.push(`- Visual style: ${t.style}`);
  }
  if (contract.tone?.length) {
    lines.push(`- Tone/personality: ${contract.tone.join(", ")} — the UI must feel ${contract.tone.join(" and ")}`);
  }
  if (contract.components) {
    const c = contract.components;
    if (c.cards) lines.push(`- Card/tile style: ${c.cards}`);
    if (c.icons) lines.push(`- Icons: ${c.icons} — strictly follow this, do NOT substitute with system emoji`);
  }
  if (contract.palette) {
    const p = contract.palette;
    if (p.bg) lines.push(`- Background color: ${p.bg}`);
    if (p.primary) lines.push(`- Primary accent: ${p.primary}`);
    if (p.accent) lines.push(`- Secondary accent: ${p.accent}`);
  }
  if (contract.prohibited?.length) {
    lines.push(`- PROHIBITED (must NOT appear in output):`);
    contract.prohibited.forEach(item => lines.push(`    ✗ ${item}`));
  }
  if (contract.contentRules) {
    const r = contract.contentRules;
    if (r.activityCount != null) {
      lines.push(`- EXACTLY ${r.activityCount} distinct tiles/sections — no more, no fewer, no duplicates`);
    }
    if (r.activities?.length) {
      lines.push(`- Required activities/sections (must each appear exactly once): ${r.activities.join(", ")}`);
    }
    if (r.notes) lines.push(`- Content rules: ${r.notes}`);
  }

  lines.push("═══ END DESIGN CONTRACT ═══");
  lines.push("");
  lines.push("Failure to follow the Design Contract above will be treated as a broken build.");

  return lines.join("\n");
}

function parseDesignContract(styleOverride?: string): DesignContract | null {
  if (!styleOverride) return null;
  const s = styleOverride.trim();
  if (!s.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as DesignContract;
    }
    return null;
  } catch {
    return null;
  }
}

/** Extract heading text from an HTML string (h2 and h3 elements). */
function extractHeadings(html: string): string[] {
  const matches = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)];
  return matches.map(m => m[1].replace(/<[^>]+>/g, "").trim().toLowerCase()).filter(Boolean);
}

/** Count tile/card elements — looks for repeated structural card patterns. */
function countTiles(html: string): number {
  // Heuristic: count divs with card/tile/activity/item/section class patterns that appear in a grid
  const cardClass = (html.match(/<div[^>]+class="[^"]*(?:card|tile|activity-card|grid-item|list-item)[^"]*"/gi) ?? []).length;
  const liItems = (html.match(/<li\b[^>]*>/gi) ?? []).length;
  // Prefer card count if it's nonzero, otherwise fall back to li count
  return cardClass > 0 ? cardClass : liItems;
}

/** Check for duplicate section headings (case-insensitive, normalized). */
function findDuplicates(headings: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const h of headings) {
    if (seen.has(h)) dupes.add(h);
    seen.add(h);
  }
  return [...dupes];
}

/** Full structural + contract validation of the generated HTML. */
function validateOutput(html: string, contract: DesignContract | null): ValidationResult {
  const issues: string[] = [];
  const headings = extractHeadings(html);
  const duplicateTitles = findDuplicates(headings);
  const tileCount = countTiles(html);

  // Duplicate headings are always a defect
  if (duplicateTitles.length > 0) {
    issues.push(`Duplicate section titles detected: ${duplicateTitles.slice(0, 3).join(", ")}`);
  }

  if (!contract) {
    return { issues, tileCount, duplicateTitles, checkedAt: new Date().toISOString() };
  }

  // Dark mode: reject plain white backgrounds
  if (contract.theme?.mode === "dark") {
    const whitePattern = /(?:background|background-color)\s*:\s*(?:white|#fff(?:fff)?)\b/i;
    const bodyStyle = html.match(/<body[^>]+style="([^"]+)"/i)?.[1] ?? "";
    if (whitePattern.test(bodyStyle) || /class="[^"]*bg-white[^"]*"/.test(html.slice(0, 2000))) {
      issues.push("Plain white background on body — contract requires dark mode");
    }
  }

  // Exact tile count
  if (contract.contentRules?.activityCount != null) {
    const expected = contract.contentRules.activityCount;
    if (tileCount > 0 && Math.abs(tileCount - expected) > 1) {
      issues.push(`Expected ~${expected} tiles, found ~${tileCount}`);
    }
  }

  // Required activities must each appear exactly once
  if (contract.contentRules?.activities?.length) {
    contract.contentRules.activities.forEach(activity => {
      const pattern = new RegExp(`\\b${activity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      const count = (html.match(pattern) ?? []).length;
      if (count === 0) {
        issues.push(`Required section "${activity}" is missing`);
      } else if (count > 4) {
        issues.push(`Section "${activity}" appears ${count} times — possible duplication`);
      }
    });
  }

  // Prohibited patterns
  if (contract.prohibited?.length) {
    contract.prohibited.forEach(item => {
      const lower = item.toLowerCase();
      if (lower.includes("white background") || lower.includes("plain white")) return; // covered above
      if (lower.includes("system emoji") || lower.includes("emoji as icon")) {
        // Check for common emoji in heading/button contexts — rough heuristic
        const emojiPattern = /[\u{1F300}-\u{1F9FF}]/u;
        if (emojiPattern.test(html.slice(0, 5000))) {
          issues.push(`Prohibited pattern detected: ${item}`);
        }
      }
    });
  }

  return { issues, tileCount, duplicateTitles, checkedAt: new Date().toISOString() };
}

function wrapFragment(html: string, title: string): string {
  const t = html.trim();
  if (/^<!DOCTYPE/i.test(t) || /^<html/i.test(t)) return t;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
</head>
<body>
${t}
</body>
</html>`;
}

registerArtifactRenderer({
  type: "html-app",
  category: "draft",
  render: async (input: HtmlAppInput): Promise<ArtifactRenderOutput> => {
    const title = input.title?.trim() || "Web App";
    const contract = parseDesignContract(input.styleOverride);
    const onStage = input.onStage;

    const styleNote = contract ? "" : input.styleOverride ? `\n\nVisual style notes: ${input.styleOverride}` : "";
    const contractNote = contract
      ? "\n\n[CRITICAL: A Design Contract has been provided in the system prompt. Follow every rule — especially the prohibited items and exact tile count.]"
      : "";

    const userPrompt = `${input.context}${styleNote}${contractNote}

---
Build the complete web app described above. Title: "${title}".
Include every feature, interaction, and visual detail discussed. Ship the full working version — not a placeholder.`;

    const systemPrompt = buildSystemPrompt(contract);

    logger.info({ projectId: input.projectId, title, hasContract: !!contract }, "htmlAppRenderer: generating web app");

    // ── Stage: Building ──────────────────────────────────────────────────────
    onStage?.("building");

    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 12000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (!raw) throw new Error("htmlAppRenderer: generation produced no output");

    const html = raw.replace(/^```html?\n?/i, "").replace(/\n?```$/, "").trim();
    const truncated = response.stop_reason === "max_tokens";
    const finalHtml = wrapFragment(html, title);

    // ── Stage: Styling ───────────────────────────────────────────────────────
    // Post-process: wrap fragment, detect structural completeness
    onStage?.("styling");

    const hasBalancedTags = (() => {
      const open = (finalHtml.match(/<(html|body)\b/gi) ?? []).length;
      const close = (finalHtml.match(/<\/(html|body)>/gi) ?? []).length;
      return open > 0 && Math.abs(open - close) <= 1;
    })();

    const reviewReasons: string[] = [];
    if (truncated) reviewReasons.push("Generation may have been cut off before completing.");
    if (!hasBalancedTags) reviewReasons.push("HTML structure looks unbalanced — may need a check.");

    // ── Stage: Checking ──────────────────────────────────────────────────────
    onStage?.("checking");

    const validation = validateOutput(finalHtml, contract);

    if (validation.issues.length > 0) {
      logger.warn({ projectId: input.projectId, issues: validation.issues }, "htmlAppRenderer: contract violations detected");

      // Retry once with explicit correction prompt
      try {
        const correctionPrompt = `The generated HTML has these issues that violate the approved Design Contract:\n${validation.issues.map(v => `- ${v}`).join("\n")}\n\nFix ONLY these specific issues and regenerate the complete HTML file. Keep all other content and functionality identical.`;

        const retryResponse = await anthropic.messages.create({
          model: "claude-opus-4-5",
          max_tokens: 12000,
          system: systemPrompt,
          messages: [
            { role: "user", content: userPrompt },
            { role: "assistant", content: raw },
            { role: "user", content: correctionPrompt },
          ],
        });

        const retryRaw = retryResponse.content[0]?.type === "text" ? retryResponse.content[0].text.trim() : "";
        if (retryRaw) {
          const retryHtml = wrapFragment(retryRaw.replace(/^```html?\n?/i, "").replace(/\n?```$/, "").trim(), title);
          const retryValidation = validateOutput(retryHtml, contract);
          if (retryValidation.issues.length === 0) {
            logger.info({ projectId: input.projectId }, "htmlAppRenderer: retry fixed all violations");
            return {
              buffer: Buffer.from(retryHtml, "utf-8"),
              title,
              mimeType: "text/html",
              extension: "html",
              status: "generated",
              preview: { safe: true, reasons: [], html: retryHtml, validation: retryValidation },
              summary: `Self-contained web app generated: ${title}.`,
            };
          }
          // Still has issues after retry — surface them but don't block
          validation.issues = retryValidation.issues;
        }
      } catch (retryErr) {
        logger.warn({ retryErr }, "htmlAppRenderer: retry attempt failed");
      }

      reviewReasons.push(...validation.issues.slice(0, 2));
    }

    const status = reviewReasons.length === 0 ? "generated" : "needs_review";

    return {
      buffer: Buffer.from(finalHtml, "utf-8"),
      title,
      mimeType: "text/html",
      extension: "html",
      status,
      preview: {
        safe: status === "generated",
        reasons: reviewReasons,
        html: finalHtml,
        validation,
      },
      summary:
        status === "generated"
          ? `Self-contained web app generated: ${title}.`
          : `Generated (review recommended): ${reviewReasons[0]}`,
    };
  },
});
