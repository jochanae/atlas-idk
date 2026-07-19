import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveToFiles } from "../resolveToFiles";
import type { UnifiedFile } from "../FilesBrowser";

function wsFile(id: string, name: string): UnifiedFile {
  return {
    id,
    name,
    category: "images",
    section: "workspace",
    updatedAt: new Date().toISOString(),
    availability: "atlas-project",
  };
}

describe("resolveToFiles", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches workspace picks from /api/fs/:id/raw (not /file)", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/api/fs/19/raw?path=");
      expect(url).not.toContain("/file?");
      return {
        ok: true,
        status: 200,
        blob: async () => new Blob([bytes], { type: "image/png" }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveToFiles([
      wsFile("ws:19:assets/logo.png", "logo.png"),
    ]);

    expect(result.skipped).toEqual([]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.name).toBe("logo.png");
    expect(result.files[0]!.type).toBe("image/png");
    expect(result.files[0]!.size).toBe(4);
  });

  it("skips workspace picks when raw fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 415,
        blob: async () => new Blob([]),
      }) as Response),
    );

    const result = await resolveToFiles([
      wsFile("ws:19:bin/photo.jpg", "photo.jpg"),
    ]);

    expect(result.files).toHaveLength(0);
    expect(result.skipped[0]?.reason).toMatch(/HTTP 415/);
  });
});
