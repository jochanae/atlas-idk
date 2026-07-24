import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inlineArtifactViewUrl,
  isBrowserViewableArtifact,
  openGeneratedArtifact,
} from "../openGeneratedArtifact";

describe("isBrowserViewableArtifact", () => {
  it("recognizes pdf by type or extension", () => {
    expect(isBrowserViewableArtifact("pdf")).toBe(true);
    expect(isBrowserViewableArtifact("document", "pdf")).toBe(true);
    expect(isBrowserViewableArtifact("xlsx")).toBe(false);
    expect(isBrowserViewableArtifact("html-app", "html")).toBe(false);
  });
});

describe("inlineArtifactViewUrl", () => {
  it("appends inline=1 without dropping existing query params", () => {
    expect(inlineArtifactViewUrl("/api/projects/1/artifacts/2/download")).toBe(
      "/api/projects/1/artifacts/2/download?inline=1",
    );
    expect(inlineArtifactViewUrl("/api/projects/1/artifacts/2/download?x=1")).toContain("inline=1");
    expect(inlineArtifactViewUrl("/api/projects/1/artifacts/2/download?x=1")).toContain("x=1");
  });

  it("returns empty for blank urls", () => {
    expect(inlineArtifactViewUrl("")).toBe("");
    expect(inlineArtifactViewUrl("   ")).toBe("");
  });
});

describe("openGeneratedArtifact", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens PDF via blob URL after a successful fetch", async () => {
    const opened: string[] = [];
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const result = await openGeneratedArtifact(
      {
        artifactId: 9,
        type: "pdf",
        downloadUrl: "/api/projects/3/artifacts/9/download",
        projectId: 3,
      },
      {
        fetchImpl: async () =>
          new Response(pdfBytes, {
            status: 200,
            headers: { "Content-Type": "application/pdf" },
          }),
        openWindow: (url) => {
          opened.push(url);
          return { closed: false } as Window;
        },
      },
    );
    expect(result).toEqual({ ok: true, mode: "native-viewer" });
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(/^blob:/);
  });

  it("errors clearly when PDF url is missing", async () => {
    const result = await openGeneratedArtifact({
      artifactId: 1,
      type: "pdf",
      downloadUrl: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("missing-url");
      expect(result.message).toMatch(/isn’t available/i);
    }
  });

  it("errors clearly when PDF is expired / not found", async () => {
    const result = await openGeneratedArtifact(
      {
        artifactId: 1,
        type: "pdf",
        downloadUrl: "/api/projects/3/artifacts/1/download",
      },
      {
        fetchImpl: async () => new Response("gone", { status: 404 }),
        openWindow: () => ({ closed: false } as Window),
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("expired");
      expect(result.message).toMatch(/no longer available|expired/i);
    }
  });

  it("does not navigate for PDF — workspace callback is unused", async () => {
    const onOpenWorkspaceOutput = vi.fn();
    await openGeneratedArtifact(
      {
        artifactId: 2,
        type: "pdf",
        downloadUrl: "/api/projects/1/artifacts/2/download",
      },
      {
        skipProbe: true,
        onOpenWorkspaceOutput,
        openWindow: () => ({ closed: false } as Window),
      },
    );
    expect(onOpenWorkspaceOutput).not.toHaveBeenCalled();
  });

  it("routes non-PDF file types through workspace output callback", async () => {
    const onOpenWorkspaceOutput = vi.fn();
    const result = await openGeneratedArtifact(
      {
        artifactId: 4,
        type: "xlsx",
        downloadUrl: "/api/projects/1/artifacts/4/download",
      },
      { onOpenWorkspaceOutput },
    );
    expect(result).toEqual({ ok: true, mode: "workspace-output" });
    expect(onOpenWorkspaceOutput).toHaveBeenCalledOnce();
  });

  it("surfaces popup-blocked when the viewer window cannot open", async () => {
    const result = await openGeneratedArtifact(
      {
        artifactId: 2,
        type: "pdf",
        downloadUrl: "/api/projects/1/artifacts/2/download",
      },
      {
        skipProbe: true,
        openWindow: () => null,
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("popup-blocked");
    }
  });
});
