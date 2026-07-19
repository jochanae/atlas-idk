/**
 * resolveToFiles — turns UnifiedFile picks from FilesBrowser into real File[]
 * so they can flow through the existing composer attach pipeline (onFiles).
 *
 * Rules:
 *  - workspace (ws:<pid>:<path>): fetch `/api/fs/:pid/raw?path=` -> Blob -> File
 *  - saved (saved:<id>): use LibraryItem.content as text, name `<title>.md`
 *  - generated (gen:<id>): if content is a URL/data-uri, fetch it; else text
 *
 * Anything we cannot resolve is reported as a skipped entry (toast at caller).
 */
import type { UnifiedFile } from "./FilesBrowser";
import type { LibraryItem } from "@/lib/library";

export interface ResolveResult {
  files: File[];
  skipped: { name: string; reason: string }[];
}

const URL_RX = /^(https?:|data:|blob:)/i;
const FETCH_TIMEOUT_MS = 30_000;

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}

async function fetchBlob(url: string): Promise<Blob> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      credentials: "include",
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.blob();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveToFiles(picks: UnifiedFile[]): Promise<ResolveResult> {
  const files: File[] = [];
  const skipped: { name: string; reason: string }[] = [];

  await Promise.all(
    picks.map(async (u) => {
      try {
        if (u.id.startsWith("ws:")) {
          // ws:<projectId>:<path>
          const rest = u.id.slice(3);
          const colon = rest.indexOf(":");
          const projectId = rest.slice(0, colon);
          const path = rest.slice(colon + 1);
          // /raw streams binary-safe bytes. /file returns JSON editor text and
          // rejects binary — unsuitable for composer attach.
          const blob = await fetchBlob(
            `/api/fs/${projectId}/raw?path=${encodeURIComponent(path)}`,
          );
          const name = basename(path);
          const type = blob.type || "application/octet-stream";
          files.push(new File([blob], name, { type }));
          return;
        }

        // saved / generated -> LibraryItem in u.raw
        const item = u.raw as LibraryItem | undefined;
        if (!item) throw new Error("no source");

        const body = (item.content ?? item.preview ?? "").trim();
        if (body && URL_RX.test(body.split(/\s+/)[0])) {
          const url = body.split(/\s+/)[0];
          const blob = await fetchBlob(url);
          const name = u.name.includes(".") ? u.name : `${u.name}.${(blob.type.split("/")[1] ?? "bin")}`;
          files.push(new File([blob], name, { type: blob.type || "application/octet-stream" }));
          return;
        }

        if (item.content && item.content.length > 0) {
          const name = u.name.endsWith(".md") ? u.name : `${u.name}.md`;
          files.push(new File([item.content], name, { type: "text/markdown" }));
          return;
        }

        skipped.push({ name: u.name, reason: "no fetchable body" });
      } catch (err) {
        skipped.push({ name: u.name, reason: (err as Error).message });
      }
    }),
  );

  return { files, skipped };
}
