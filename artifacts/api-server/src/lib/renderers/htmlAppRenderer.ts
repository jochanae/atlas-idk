// HTML App renderer — generates a complete self-contained web app from conversation context.
// Uses Claude to produce an interactive, visually polished single-file HTML/CSS/JS application.
// Registered with the Artifact Engine as type "html-app" so generate_deliverable can invoke it.
import Anthropic from "@anthropic-ai/sdk";
import { registerArtifactRenderer, type ArtifactRenderOutput } from "../artifactEngine";
import { logger } from "../logger";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface HtmlAppInput {
  context: string;
  title?: string;
  docType?: string;
  projectId?: number;
  styleOverride?: string;
}

const SYSTEM_PROMPT = `You are an expert frontend developer. Generate a complete, self-contained, production-quality HTML web application based on the conversation context.

Rules:
- Output a single HTML file with all CSS and JavaScript embedded inline — no external files, no build step required
- Allowed CDN sources: cdn.tailwindcss.com, unpkg.com, cdnjs.cloudflare.com, fonts.googleapis.com, fonts.gstatic.com
- The result must be immediately functional when pasted into a browser — no placeholders, no TODOs
- Match the exact visual style, features, and requirements described in the conversation
- Produce the most polished, complete version you can within one file
- Begin with <!DOCTYPE html> and include a complete valid HTML document structure

Output ONLY the raw HTML. No markdown fences, no explanations, no preamble.`;

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
    const styleHint = input.styleOverride ? `\n\nVisual style notes: ${input.styleOverride}` : "";

    const userPrompt = `${input.context}${styleHint}

---
Build the complete web app described above. Title: "${title}".
Include every feature, interaction, and visual detail discussed. Ship the full working version — not a placeholder.`;

    logger.info({ projectId: input.projectId, title }, "htmlAppRenderer: generating web app");

    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 12000,
      system: SYSTEM_PROMPT,
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
