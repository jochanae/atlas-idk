/**
 * POST /api/url-intelligence
 *
 * Single-round-trip URL enrichment for the workspace chat input.
 * Runs screenshot (Microlink) + scrape (HTML fetch) in parallel and returns
 * a combined payload the frontend uses to show a preview card and inject
 * visual + textual context into the Atlas message.
 */

import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { logger } from "../lib/logger";
import { assertSafeUrl, safeFetch } from "../lib/ssrf";

const router: IRouter = Router();

const KNOWN_SERVICES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /stripe\.com/i,     label: "Stripe" },
  { pattern: /shopify\.com/i,    label: "Shopify" },
  { pattern: /github\.com/i,     label: "GitHub" },
  { pattern: /linear\.app/i,     label: "Linear" },
  { pattern: /notion\.so/i,      label: "Notion" },
  { pattern: /figma\.com/i,      label: "Figma" },
  { pattern: /vercel\.com/i,     label: "Vercel" },
  { pattern: /netlify\.com/i,    label: "Netlify" },
  { pattern: /supabase\.com/i,   label: "Supabase" },
  { pattern: /firebase\.google/i, label: "Firebase" },
  { pattern: /airtable\.com/i,   label: "Airtable" },
  { pattern: /intercom\.com/i,   label: "Intercom" },
  { pattern: /hubspot\.com/i,    label: "HubSpot" },
  { pattern: /salesforce\.com/i, label: "Salesforce" },
  { pattern: /slack\.com/i,      label: "Slack" },
  { pattern: /discord\.com/i,    label: "Discord" },
  { pattern: /trello\.com/i,     label: "Trello" },
  { pattern: /jira\.atlassian/i, label: "Jira" },
  { pattern: /confluence\.atlassian/i, label: "Confluence" },
  { pattern: /aws\.amazon/i,     label: "AWS" },
  { pattern: /cloud\.google/i,   label: "Google Cloud" },
  { pattern: /azure\.microsoft/i, label: "Azure" },
  { pattern: /openai\.com/i,     label: "OpenAI" },
  { pattern: /anthropic\.com/i,  label: "Anthropic" },
  { pattern: /producthunt\.com/i, label: "Product Hunt" },
  { pattern: /ycombinator\.com/i, label: "Y Combinator" },
  { pattern: /twitter\.com|x\.com/i, label: "X / Twitter" },
  { pattern: /linkedin\.com/i,   label: "LinkedIn" },
  { pattern: /medium\.com/i,     label: "Medium" },
];

function detectService(host: string): string | null {
  for (const { pattern, label } of KNOWN_SERVICES) {
    if (pattern.test(host)) return label;
  }
  return null;
}

function metaContent(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']` +
    `|<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,
    "i",
  );
  const m = html.match(re);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

const BodySchema = z.object({
  url: z.string().url(),
});

router.post("/url-intelligence", async (req, res): Promise<void> => {
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  const { url } = parsed.data;

  try {
    await assertSafeUrl(url);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }

  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  const detectedService = detectService(host);

  // ── Run screenshot + scrape in parallel ──────────────────────────────────
  const [screenshotResult, scrapeResult] = await Promise.allSettled([
    (async () => {
      const mlUrl =
        `https://api.microlink.io/?url=${encodeURIComponent(url)}` +
        `&screenshot=true&fullPage=false&meta=false&embed=screenshot.url`;
      const mlRes = await fetch(mlUrl, {
        headers: { "User-Agent": "Atlas-URLIntel/1.0" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!mlRes.ok) throw new Error(`Microlink ${mlRes.status}`);
      const mlData = await mlRes.json() as {
        data?: { screenshot?: { url?: string } };
      };
      const screenshotUrl = mlData?.data?.screenshot?.url;
      if (!screenshotUrl) throw new Error("No screenshot URL");
      const imgRes = await fetch(screenshotUrl, { signal: AbortSignal.timeout(12_000) });
      if (!imgRes.ok) throw new Error(`Img fetch ${imgRes.status}`);
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      const ct = imgRes.headers.get("content-type") ?? "image/jpeg";
      const mediaType = ct.includes("png") ? "image/png" : ct.includes("webp") ? "image/webp" : "image/jpeg";
      return { base64: buffer.toString("base64"), mediaType };
    })(),

    (async () => {
      const r = await safeFetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Atlas-URLIntel/1.0)", Accept: "text/html" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = (titleMatch?.[1] ?? metaContent(html, "og:title") ?? "").trim() || null;

      const description =
        metaContent(html, "og:description") ??
        metaContent(html, "description") ??
        null;

      const ogImage = metaContent(html, "og:image") ?? null;

      const headings = (html.match(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/gi) ?? [])
        .map(h => h.replace(/<[^>]+>/g, "").trim())
        .filter(Boolean)
        .slice(0, 10);

      let text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 6000);

      return { title, description, ogImage, headings, text };
    })(),
  ]);

  const screenshot = screenshotResult.status === "fulfilled" ? screenshotResult.value : null;
  const scrape     = scrapeResult.status === "fulfilled"     ? scrapeResult.value     : null;

  if (screenshotResult.status === "rejected") {
    logger.warn({ err: screenshotResult.reason, url }, "url-intelligence: screenshot failed");
  }
  if (scrapeResult.status === "rejected") {
    logger.warn({ err: scrapeResult.reason, url }, "url-intelligence: scrape failed");
  }

  res.json({
    url,
    host,
    detectedService,
    title:            scrape?.title ?? null,
    description:      scrape?.description ?? null,
    ogImage:          scrape?.ogImage ?? null,
    headings:         scrape?.headings ?? [],
    text:             scrape?.text ?? null,
    screenshotBase64: screenshot ? `data:${screenshot.mediaType};base64,${screenshot.base64}` : null,
    screenshotRaw:    screenshot ?? null,
  });
});

export default router;
