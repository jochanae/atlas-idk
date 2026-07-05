import { tool } from "ai";
import { z } from "zod";
import { db, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AgentToolContext } from "./context";

export function screenshotPreviewTool(ctx: AgentToolContext) {
  return tool({
    description: "Capture a screenshot of the project preview URL and return a storage URL.",
    inputSchema: z.object({
      path: z.string().optional(),
      viewport: z.string().optional(),
    }),
    execute: async ({ path, viewport }) => {
      const started = performance.now();
      ctx.emitToolCall("screenshot_preview", { path, viewport });
      try {
        const [project] = await db
          .select({ previewUrl: projectsTable.previewUrl })
          .from(projectsTable)
          .where(eq(projectsTable.id, ctx.projectId))
          .limit(1);

        const targetUrl = path?.startsWith("http") ? path : project?.previewUrl;
        if (!targetUrl) {
          const ms = Math.round(performance.now() - started);
          ctx.emitToolResult("screenshot_preview", false, ms);
          return { ok: false, error: "No preview URL configured for this project" };
        }

        const mlUrl =
          `https://api.microlink.io/?url=${encodeURIComponent(targetUrl)}` +
          `&screenshot=true&fullPage=false&meta=false&embed=screenshot.url`;

        const mlRes = await fetch(mlUrl, {
          headers: { "User-Agent": "Atlas-Agent/1.0" },
          signal: AbortSignal.timeout(30_000),
        });
        if (!mlRes.ok) throw new Error(`Microlink failed: ${mlRes.status}`);

        const mlData = await mlRes.json() as { data?: { screenshot?: { url?: string } } };
        const screenshotUrl = mlData?.data?.screenshot?.url;
        if (!screenshotUrl) throw new Error("No screenshot URL returned");

        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("screenshot_preview", true, ms);
        return { ok: true, url: screenshotUrl, targetUrl };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("screenshot_preview", false, ms);
        return { ok: false, error: String(err) };
      }
    },
  });
}
