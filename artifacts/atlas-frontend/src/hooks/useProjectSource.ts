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
}
export function openCodebase(detail: CodebaseOpenDetail) {
  window.dispatchEvent(new CustomEvent("codebase:open", { detail }));
}
