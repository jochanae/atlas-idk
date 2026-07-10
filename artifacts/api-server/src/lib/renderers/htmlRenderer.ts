// HTML deliverable renderer — Phase 3B.4.
//
// Reuses the existing Draft/Sandbox HTML pathway (Atlas already generates
// standalone HTML via FILE_EDIT at preview/output.html, rendered client-side
// through PreviewPanel's buildSrcdoc). This renderer does not generate new
// HTML — it takes HTML the app already produced and runs it through the
// Artifact Engine so it becomes a real persisted deliverable: project_artifacts
// row, Ledger entry, Deliverables listing, and a downloadable .html file.
import { registerArtifactRenderer, type ArtifactRenderOutput } from "../artifactEngine";

const ALLOWED_SCRIPT_HOSTS = [
  "cdn.tailwindcss.com",
  "unpkg.com",
  "cdnjs.cloudflare.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

interface HtmlSafetyResult {
  safe: boolean;
  reasons: string[];
}

/**
 * Heuristic completeness/safety check that decides auto-render vs. review
 * mode. This intentionally errs toward "needs review" for anything it can't
 * confidently classify as safe — the review gate is cheap for the user,
 * silently rendering unsafe/incomplete markup is not.
 */
function assessHtmlSafety(html: string, truncated: boolean): HtmlSafetyResult {
  const reasons: string[] = [];

  if (truncated) reasons.push("Generation may have been cut off before completing.");
  if (!html.trim()) reasons.push("No HTML content was produced.");

  const openTags = (html.match(/<(html|body|div|section|main)\b/gi) ?? []).length;
  const closeTags = (html.match(/<\/(html|body|div|section|main)>/gi) ?? []).length;
  if (openTags > 0 && Math.abs(openTags - closeTags) > 2) {
    reasons.push("HTML tags look unbalanced — the markup may be incomplete.");
  }

  if (/\beval\s*\(/.test(html)) reasons.push("Contains eval() — unsupported dynamic code execution.");
  if (/document\.write\s*\(/.test(html)) reasons.push("Uses document.write(), which is unsupported in the preview sandbox.");
  if (/new\s+Function\s*\(/.test(html)) reasons.push("Contains dynamically constructed function code.");
  if (/\bfetch\s*\(|\bXMLHttpRequest\b/.test(html)) reasons.push("Makes network requests — review before running.");

  const scriptSrcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
  for (const src of scriptSrcs) {
    try {
      const host = new URL(src, "https://same-origin.local").hostname;
      if (host !== "same-origin.local" && !ALLOWED_SCRIPT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
        reasons.push(`References an external script from an unrecognized source (${host}).`);
      }
    } catch {
      // relative/invalid src — ignore
    }
  }

  return { safe: reasons.length === 0, reasons };
}

/** Wraps bare markup/fragments as a standalone document; passes full documents through untouched. */
function wrapAsStandaloneDocument(html: string): string {
  const t = html.trim();
  if (/^<!DOCTYPE/i.test(t) || /^<html/i.test(t)) return t;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<script src="https://cdn.tailwindcss.com"></script>
<style>*,*::before,*::after{box-sizing:border-box;}body{margin:0;padding:0;}</style>
</head>
<body>
${t}
</body>
</html>`;
}

export interface HtmlRendererInput {
  html: string;
  title?: string;
  /** Set true if the client detected the source generation was cut off (e.g. hit a token/size limit). */
  truncated?: boolean;
}

registerArtifactRenderer({
  type: "html",
  category: "draft",
  render: async (input: HtmlRendererInput): Promise<ArtifactRenderOutput> => {
    const rawHtml = (input.html ?? "").toString();
    const { safe, reasons } = assessHtmlSafety(rawHtml, !!input.truncated);
    const document = wrapAsStandaloneDocument(rawHtml);
    const title = input.title?.trim() || "HTML Draft";

    return {
      buffer: Buffer.from(document, "utf-8"),
      title,
      mimeType: "text/html",
      extension: "html",
      status: safe ? "generated" : "needs_review",
      preview: {
        safe,
        reasons,
        html: document,
      },
      summary: safe
        ? "Auto-rendered — self-contained and safe."
        : `Held for review: ${reasons[0] ?? "needs a manual check"}.`,
    };
  },
});
