/**
 * Open action for inline ArtifactCreatedCard deliverables.
 *
 * PDF (and other browser-viewable binaries) must open in a visible viewer —
 * never silently no-op when Workspace isn't mounted. Download stays on the
 * separate Download control (Content-Disposition: attachment).
 */

import { getAuthHeaders } from "@/lib/api";

export type OpenGeneratedArtifactInput = {
  artifactId: number | string;
  type: string;
  extension?: string;
  downloadUrl?: string | null;
  projectId?: number;
};

export type OpenGeneratedArtifactResult =
  | { ok: true; mode: "native-viewer" | "workspace-output" }
  | {
      ok: false;
      reason: "missing-url" | "unavailable" | "expired" | "popup-blocked";
      message: string;
    };

export function isBrowserViewableArtifact(type: string, extension?: string): boolean {
  const normalized = (extension || type || "").toLowerCase();
  return normalized === "pdf" || type.toLowerCase() === "pdf";
}

export function inlineArtifactViewUrl(downloadUrl: string): string {
  const trimmed = downloadUrl.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    url.searchParams.set("inline", "1");
    // Prefer path+search for same-origin navigation (keeps cookies / relative auth).
    if (typeof window !== "undefined" && url.origin === window.location.origin) {
      return `${url.pathname}${url.search}`;
    }
    return url.toString();
  } catch {
    const sep = trimmed.includes("?") ? "&" : "?";
    return `${trimmed}${sep}inline=1`;
  }
}

type OpenOpts = {
  /** Called for non-viewable types (xlsx, pptx, …) to deep-link Outputs. */
  onOpenWorkspaceOutput?: () => void;
  fetchImpl?: typeof fetch;
  openWindow?: (url: string) => Window | null;
  /** Test seam — skip network and open the given URL directly. */
  skipProbe?: boolean;
};

/**
 * Execute the card Open affordance.
 * - PDF → fetch + native/browser viewer (blob URL), with clear errors on failure
 * - Other file types → workspace Outputs deep-link via callback
 */
export async function openGeneratedArtifact(
  artifact: OpenGeneratedArtifactInput,
  opts?: OpenOpts,
): Promise<OpenGeneratedArtifactResult> {
  const downloadUrl = artifact.downloadUrl?.trim() ?? "";
  const openWindow =
    opts?.openWindow ??
    ((url: string) => {
      if (typeof window === "undefined") return null;
      return window.open(url, "_blank", "noopener,noreferrer");
    });

  if (isBrowserViewableArtifact(artifact.type, artifact.extension)) {
    if (!downloadUrl) {
      return {
        ok: false,
        reason: "missing-url",
        message: "This PDF isn’t available to open.",
      };
    }

    if (opts?.skipProbe) {
      const win = openWindow(inlineArtifactViewUrl(downloadUrl));
      if (!win) {
        return {
          ok: false,
          reason: "popup-blocked",
          message: "Couldn’t open the PDF — allow popups and try again.",
        };
      }
      return { ok: true, mode: "native-viewer" };
    }

    const fetchImpl = opts?.fetchImpl ?? fetch;
    try {
      const res = await fetchImpl(downloadUrl, {
        credentials: "include",
        headers: { ...getAuthHeaders() },
      });

      if (res.status === 404 || res.status === 410) {
        return {
          ok: false,
          reason: "expired",
          message: "This PDF is no longer available — it may have expired.",
        };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          reason: "unavailable",
          message: "You don’t have access to open this PDF.",
        };
      }
      if (!res.ok) {
        return {
          ok: false,
          reason: "unavailable",
          message: "Couldn’t open this PDF. Try Download, or generate it again.",
        };
      }

      const blob = await res.blob();
      const pdfBlob =
        blob.type === "application/pdf"
          ? blob
          : new Blob([blob], { type: "application/pdf" });
      const objectUrl = URL.createObjectURL(pdfBlob);
      const win = openWindow(objectUrl);
      if (!win) {
        URL.revokeObjectURL(objectUrl);
        // Fallback: same-origin inline URL (no blob popup). Still a visible action.
        const inlineWin = openWindow(inlineArtifactViewUrl(downloadUrl));
        if (!inlineWin) {
          return {
            ok: false,
            reason: "popup-blocked",
            message: "Couldn’t open the PDF — allow popups and try again.",
          };
        }
        return { ok: true, mode: "native-viewer" };
      }
      // Keep the blob alive long enough for the viewer tab to load.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      return { ok: true, mode: "native-viewer" };
    } catch {
      return {
        ok: false,
        reason: "unavailable",
        message: "Couldn’t open this PDF. Check your connection and try again.",
      };
    }
  }

  if (opts?.onOpenWorkspaceOutput) {
    opts.onOpenWorkspaceOutput();
    return { ok: true, mode: "workspace-output" };
  }

  if (downloadUrl) {
    const win = openWindow(downloadUrl);
    if (!win) {
      return {
        ok: false,
        reason: "popup-blocked",
        message: "Couldn’t open the file — allow popups and try again.",
      };
    }
    return { ok: true, mode: "native-viewer" };
  }

  return {
    ok: false,
    reason: "missing-url",
    message: "This file isn’t available to open.",
  };
}
