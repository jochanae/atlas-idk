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
      lines.push(`- Required activities/sections: ${r.activities.join(", ")}`);
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

function validateOutput(html: string, contract: DesignContract | null): string[] {
  const issues: string[] = [];

  // Plain white background check
  if (contract?.theme?.mode === "dark") {
    if (/bg-white\b|background:\s*white\b|background:\s*#fff\b|background:\s*#ffffff\b/i.test(html)) {
      issues.push("Plain white background detected — contract requires dark mode");
    }
  }

  // Exact activity count check
  if (contract?.contentRules?.activityCount && contract.contentRules.activities?.length) {
    const activities = contract.contentRules.activities;
    activities.forEach(activity => {
      const pattern = new RegExp(activity, "gi");
      const matches = html.match(pattern) ?? [];
      if (matches.length > 2) {
        issues.push(`Activity "${activity}" appears ${matches.length} times — possible duplication`);
      }
    });
  }

  return issues;
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

    const styleNote = contract
      ? "" // already in system prompt
      : input.styleOverride
        ? `\n\nVisual style notes: ${input.styleOverride}`
        : "";

    const contractNote = contract
      ? "\n\n[CRITICAL: A Design Contract has been provided in the system prompt. It defines the exact visual direction that was approved. You MUST follow every rule in it — especially the prohibited items list and exact tile/activity count.]"
      : "";

    const userPrompt = `${input.context}${styleNote}${contractNote}

---
Build the complete web app described above. Title: "${title}".
Include every feature, interaction, and visual detail discussed. Ship the full working version — not a placeholder.`;

    const systemPrompt = buildSystemPrompt(contract);

    logger.info({ projectId: input.projectId, title, hasContract: !!contract }, "htmlAppRenderer: generating web app");

    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 12000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (!raw) {
      throw new Error("htmlAppRenderer: generation produced no output");
    }

    const html = raw
      .replace(/^```html?\n?/i, "")
      .replace(/\n?```$/, "")
      .trim();

    const truncated = response.stop_reason === "max_tokens";
    const finalHtml = wrapFragment(html, title);

    const hasBalancedTags = (() => {
      const open = (finalHtml.match(/<(html|body)\b/gi) ?? []).length;
      const close = (finalHtml.match(/<\/(html|body)>/gi) ?? []).length;
      return open > 0 && Math.abs(open - close) <= 1;
    })();

    const reviewReasons: string[] = [];
    if (truncated) reviewReasons.push("Generation may have been cut off before completing.");
    if (!hasBalancedTags) reviewReasons.push("HTML structure looks unbalanced — may need a check.");

    // Structural validation against design contract
    const contractViolations = validateOutput(finalHtml, contract);
    if (contractViolations.length > 0) {
      logger.warn({ projectId: input.projectId, contractViolations }, "htmlAppRenderer: contract violations detected");

      // Retry once with explicit correction instructions
      try {
        const correctionPrompt = `The generated HTML has these issues that violate the approved Design Contract:\n${contractViolations.map(v => `- ${v}`).join("\n")}\n\nPlease fix ONLY these specific issues and regenerate the complete HTML file. Keep all other content and functionality identical.`;

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
          const retryHtml = wrapFragment(
            retryRaw.replace(/^```html?\n?/i, "").replace(/\n?```$/, "").trim(),
            title
          );
          const stillViolating = validateOutput(retryHtml, contract);
          if (stillViolating.length === 0) {
            logger.info({ projectId: input.projectId }, "htmlAppRenderer: retry fixed contract violations");
            return {
              buffer: Buffer.from(retryHtml, "utf-8"),
              title,
              mimeType: "text/html",
              extension: "html",
              status: "generated",
              preview: { safe: true, reasons: [], html: retryHtml },
              summary: `Self-contained web app generated: ${title}.`,
            };
          }
        }
        reviewReasons.push(`Design contract violations remain: ${contractViolations[0]}`);
      } catch (retryErr) {
        logger.warn({ retryErr }, "htmlAppRenderer: retry attempt failed");
        reviewReasons.push(`Design contract violations detected: ${contractViolations[0]}`);
      }
    }

    return {
      buffer: Buffer.from(finalHtml, "utf-8"),
      title,
      mimeType: "text/html",
      extension: "html",
      status: reviewReasons.length === 0 ? "generated" : "needs_review",
      preview: {
        safe: reviewReasons.length === 0,
        reasons: reviewReasons,
        html: finalHtml,
      },
      summary:
        reviewReasons.length === 0
          ? `Self-contained web app generated: ${title}.`
          : `Generated (review recommended): ${reviewReasons[0]}`,
    };
  },
});
