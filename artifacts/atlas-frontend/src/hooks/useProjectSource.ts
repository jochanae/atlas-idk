// F2 Source Intelligence — frontend hooks.
// Talks to Cloud Run /api/sources/* via the global fetch shim (install-api-fetch.ts).
import { useCallback, useEffect, useRef, useState } from "react";

export type SourceIngestStatus = "pending" | "indexing" | "ready" | "failed";

export interface ProjectSource {
  id: string;
  projectId: number;
  sourceType: "zip" | "github" | "replit" | "generated" | "pasted";
  isPrimary: boolean;
  lastIngestStatus: SourceIngestStatus;
  lastIngestError?: string | null;
  fileCount: number;
  totalBytes: number;
  lastIngestedAt?: string | null;
}

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  sizeBytes?: number;
  language?: string | null;
  children?: TreeNode[];
}

export interface SearchHit {
  path: string;
  line: number;
  text: string;
  language?: string | null;
}

export interface FilePayload {
  path: string;
  content: string;
  language?: string | null;
  sizeBytes: number;
  exports: Array<{ name: string; kind: string; line: number }>;
  imports: Array<{ specifier: string; resolvedPath: string | null; line: number }>;
}

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json() as Promise<T>;
}

export function useProjectSource(projectId: number | null | undefined) {
  const [source, setSource] = useState<ProjectSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await jget<{ sources: ProjectSource[] }>(
        `/api/sources/${projectId}`,
      );
      const primary = data.sources.find((s) => s.isPrimary) ?? data.sources[0] ?? null;
      setSource(primary);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Poll while indexing.
  useEffect(() => {
    if (!source || source.lastIngestStatus !== "indexing") {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = window.setInterval(() => { void refresh(); }, 2500);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [source, refresh]);

  return { source, loading, error, refresh };
}

export function useSourceTree(sourceId: string | null | undefined) {
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!sourceId) { setTree(null); return; }
    let alive = true;
    setLoading(true);
    jget<{ tree: TreeNode[] }>(`/api/sources/${sourceId}/tree`)
      .then((d) => { if (alive) setTree(d.tree); })
      .catch((e) => { if (alive) setError(String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sourceId]);
  return { tree, loading, error };
}

export function useSourceFile(sourceId: string | null | undefined, path: string | null) {
  const [file, setFile] = useState<FilePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!sourceId || !path) { setFile(null); return; }
    let alive = true;
    setLoading(true);
    setError(null);
    jget<FilePayload>(
      `/api/sources/${sourceId}/file?path=${encodeURIComponent(path)}`,
    )
      .then((d) => { if (alive) setFile(d); })
      .catch((e) => { if (alive) setError(String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sourceId, path]);
  return { file, loading, error };
}

export async function searchSource(sourceId: string, query: string): Promise<SearchHit[]> {
  if (!query.trim()) return [];
  const d = await jget<{ hits: Array<{ path: string; line: number; preview: string }> }>(
    `/api/sources/${sourceId}/search?q=${encodeURIComponent(query)}`,
  );
  return (d.hits ?? []).map((h) => ({ path: h.path, line: h.line, text: h.preview }));
}

// Cross-project citation click-through (Phase 3A step 2). Read-only peek at
// another owned project's primary-source file — used when a citation from
// `search_all_projects` points at a project other than the one currently open.
export interface CrossProjectFile {
  projectId: number;
  projectName: string;
  path: string;
  language?: string | null;
  sizeBytes: number;
  content: string;
}
export async function peekOtherProjectFile(
  projectId: number,
  path: string,
): Promise<CrossProjectFile> {
  return jget<CrossProjectFile>(
    `/api/sources/by-project/${projectId}/peek?path=${encodeURIComponent(path)}`,
  );
}

// Name → id lookup for cross-project citations, which only carry the project
// NAME in the chat text ("ProjectName › path:Lline"). Cached module-wide
// (invalidated on page reload) since the project list changes rarely relative
// to how often citations render.
let projectNameCache: Map<string, number> | null = null;
let projectNameCachePromise: Promise<Map<string, number>> | null = null;

async function loadProjectNameCache(): Promise<Map<string, number>> {
  const d = await jget<{ id: number; name: string }[] | { projects: { id: number; name: string }[] }>(
    "/api/projects",
  );
  const list = Array.isArray(d) ? d : d.projects;
  return new Map(list.map((p) => [p.name, p.id]));
}

export async function resolveProjectIdByName(name: string): Promise<number | undefined> {
  if (!projectNameCache) {
    if (!projectNameCachePromise) projectNameCachePromise = loadProjectNameCache();
    try {
      projectNameCache = await projectNameCachePromise;
    } catch {
      projectNameCachePromise = null;
      return undefined;
    }
  }
  return projectNameCache.get(name);
}

// --- Deep-link event contract -------------------------------------------------
// Any surface (Nexus chat, Workspace chat, Ledger entry) can dispatch this
// to focus the CodebasePanel to a file / line range:
//
//   window.dispatchEvent(new CustomEvent("codebase:open", {
//     detail: { path: "src/foo.ts", lineStart: 12, lineEnd: 24 }
//   }));
//
export interface CodebaseOpenDetail {
  path: string;
  lineStart?: number;
  lineEnd?: number;
  // Set when the citation points at a DIFFERENT project than the one
  // currently open (from search_all_projects). CodebasePanel renders this
  // as a read-only overlay via peekOtherProjectFile instead of switching
  // its own sourceId.
  crossProjectId?: number;
  crossProjectName?: string;
}
export function openCodebase(detail: CodebaseOpenDetail) {
  window.dispatchEvent(new CustomEvent("codebase:open", { detail }));
}
