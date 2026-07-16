/**
 * Open a Library project-artifact in Draft Preview.
 *
 * Reuses the existing workspace preview contract:
 *   fetch download → persist atlas-sandbox → axiom:open-preview { source: "sandbox", content }
 */

export type DraftPreviewSourceRef = {
  sourceKind: "project-artifact";
  sourceId: string;
  projectId: number;
  artifactType?: string | null;
};

export type DraftHtmlProbe = {
  status: number;
  contentType: string | null;
  contentDisposition: string | null;
  bodyLength: number;
  beginsWithDoctype: boolean;
  beginsWithHtml: boolean;
  usable: boolean;
  html: string;
};

export function sandboxStorageKey(projectId: number): string {
  return `atlas-sandbox-${projectId}`;
}

export function previewModeStorageKey(projectId: number): string {
  return `atlas-preview-mode-${projectId}`;
}

export function draftArtifactStorageKey(projectId: number): string {
  return `atlas-draft-artifact-${projectId}`;
}

export function pendingDraftStorageKey(projectId: number): string {
  return `atlas-pending-draft-${projectId}`;
}

export function downloadPathFor(ref: DraftPreviewSourceRef): string {
  return `/api/projects/${ref.projectId}/artifacts/${ref.sourceId}/download`;
}

export function isUsableDraftHtml(body: string): boolean {
  const trimmed = body.trimStart();
  return /^<!DOCTYPE\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);
}

export async function fetchDraftHtml(ref: DraftPreviewSourceRef): Promise<DraftHtmlProbe> {
  const res = await fetch(downloadPathFor(ref), { credentials: "include" });
  const contentType = res.headers.get("content-type");
  const contentDisposition = res.headers.get("content-disposition");
  const html = await res.text();
  const beginsWithDoctype = /^<!DOCTYPE\s+html/i.test(html.trimStart());
  const beginsWithHtml = /^<html[\s>]/i.test(html.trimStart());
  const usable = res.ok && (beginsWithDoctype || beginsWithHtml);
  return {
    status: res.status,
    contentType,
    contentDisposition,
    bodyLength: html.length,
    beginsWithDoctype,
    beginsWithHtml,
    usable,
    html,
  };
}

/** Persist Draft HTML + mode + artifact ref for refresh / Play restore. */
export function persistDraftPreview(projectId: number, html: string, artifactId: string): void {
  try { localStorage.setItem(sandboxStorageKey(projectId), html); } catch {}
  try { localStorage.setItem(previewModeStorageKey(projectId), "sandbox"); } catch {}
  try {
    localStorage.setItem(
      draftArtifactStorageKey(projectId),
      JSON.stringify({ projectId, artifactId }),
    );
  } catch {}
}

/** Dispatch existing preview events (no-op if workspace listeners aren't mounted yet). */
export function dispatchOpenDraftPreview(html: string): void {
  window.dispatchEvent(
    new CustomEvent("axiom:open-preview", {
      detail: { source: "sandbox", content: html },
    }),
  );
}

/**
 * Fetch + validate + persist + open Draft Preview for a Library sourceRef.
 * When `navigateToProject` is provided and the current route isn't that project,
 * stores a pending flag and navigates; workspace picks it up on mount.
 */
export async function openLibraryDraftPreview(
  ref: DraftPreviewSourceRef,
  opts?: {
    navigateToProject?: (projectId: number) => void;
    currentProjectId?: number | null;
  },
): Promise<DraftHtmlProbe> {
  const probe = await fetchDraftHtml(ref);
  if (!probe.usable) {
    return probe;
  }

  persistDraftPreview(ref.projectId, probe.html, ref.sourceId);

  const onProject = opts?.currentProjectId != null && opts.currentProjectId === ref.projectId;
  if (!onProject && opts?.navigateToProject) {
    try { sessionStorage.setItem(pendingDraftStorageKey(ref.projectId), "1"); } catch {}
    opts.navigateToProject(ref.projectId);
    return probe;
  }

  dispatchOpenDraftPreview(probe.html);
  return probe;
}

/** Called by workspace on mount / project switch to flush a pending Library open. */
export function consumePendingDraftPreview(projectId: number): string | null {
  try {
    const pending = sessionStorage.getItem(pendingDraftStorageKey(projectId));
    if (!pending) return null;
    sessionStorage.removeItem(pendingDraftStorageKey(projectId));
  } catch {
    return null;
  }
  try {
    return localStorage.getItem(sandboxStorageKey(projectId));
  } catch {
    return null;
  }
}
