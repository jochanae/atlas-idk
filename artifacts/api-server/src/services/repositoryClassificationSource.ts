/**
 * Source adapters for the repository classifier.
 *
 * These adapters are the ONLY place where I/O occurs in the classification
 * pipeline. They load file records and hand them to the pure classifyRepository()
 * function in @workspace/repo-classifier.
 *
 * Two sources:
 *   local-complete — reads from the project's cloned workspace directory on disk.
 *   github-partial — fetches the file tree from GitHub API and selectively
 *                    fetches content for files that inform the classifier.
 */
import { readdir, readFile, stat } from "fs/promises";
import path from "path";
import type { RepositoryFile, RepositoryClassificationInput, ClassificationLimits } from "@workspace/repo-classifier";
import { DEFAULT_CLASSIFICATION_LIMITS } from "@workspace/repo-classifier";

const GH_API = "https://api.github.com";

// ── File selection filters ────────────────────────────────────────────────────

/**
 * Files that are always worth fetching from GitHub.
 * Checked against the basename portion of the path.
 */
const ALWAYS_FETCH_BASENAMES = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  "yarn.lock",
  "package-lock.json",
  "bun.lockb",
  "nx.json",
  "turbo.json",
  "app.json",
  "expo.json",
  "index.html",
]);

const ALWAYS_FETCH_PATTERNS: RegExp[] = [
  /^vite\.config\.(js|ts|mjs|cjs)$/,
  /^next\.config\.(js|ts|mjs|cjs)$/,
  /^astro\.config\.(js|ts|mjs|cjs)$/,
  /^svelte\.config\.(js|ts)$/,
  /^remix\.config\.(js|ts)$/,
  /^nuxt\.config\.(js|ts)$/,
  /^angular\.json$/,
  /^\.env\.(example|sample|template)$/,
  /^schema\.prisma$/,
  /^Dockerfile$/,
  /^docker-compose\.(yml|yaml)$/,
  /^\.(eslint|prettier|tsconfig)\.(json|js|cjs|mjs|ts)$/,
  /^tsconfig\.json$/,
  /^tsconfig\.base\.json$/,
  // Key source entry points
  /^(src|app|lib)\/(main|index)\.(ts|tsx|js|jsx|mts|cts)$/,
  /^(src|app)\/(db|client|server)\.(ts|js)$/,
];

function shouldFetch(filePath: string): boolean {
  const basename = path.basename(filePath);
  if (ALWAYS_FETCH_BASENAMES.has(basename)) return true;
  return ALWAYS_FETCH_PATTERNS.some((re) => re.test(basename));
}

// ── Local workspace adapter ───────────────────────────────────────────────────

async function walkDir(
  dir: string,
  root: string,
  files: RepositoryFile[],
  limits: ClassificationLimits,
  totals: { bytes: number; count: number },
): Promise<void> {
  let entries: import("fs").Dirent<string>[];
  try {
    entries = await readdir(dir, { withFileTypes: true, encoding: "utf-8" });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (totals.count >= limits.maxFiles || totals.bytes >= limits.maxTotalBytes) break;
    const name = String(entry.name);
    // Skip hidden directories and common noise dirs
    if (entry.isDirectory()) {
      if (
        name.startsWith(".") ||
        name === "node_modules" ||
        name === "dist" ||
        name === ".git" ||
        name === "__pycache__" ||
        name === ".next" ||
        name === ".expo" ||
        name === "build" ||
        name === "coverage"
      ) continue;
      await walkDir(path.join(dir, name), root, files, limits, totals);
    } else if (entry.isFile()) {
      const fullPath = path.join(dir, name);
      const relPath = path.relative(root, fullPath).replace(/\\/g, "/");
      let info: { size: number } | null = null;
      try { info = await stat(fullPath); } catch { continue; }
      if (info.size > limits.maxFileBytes) {
        // Include path but omit content for oversized files
        files.push({ path: relPath });
        totals.count++;
        continue;
      }
      let content: string | undefined;
      try {
        const raw = await readFile(fullPath);
        // Skip binary files (heuristic: contains null bytes)
        if (raw.indexOf(0) !== -1) { files.push({ path: relPath }); totals.count++; continue; }
        content = raw.toString("utf-8");
        totals.bytes += content.length;
      } catch { /* unreadable */ }
      files.push({ path: relPath, content });
      totals.count++;
    }
  }
}

/**
 * Load all files from a cloned workspace directory.
 * Returns a local-complete RepositoryClassificationInput.
 */
export async function loadFromWorkspace(
  workspaceDir: string,
  limits: ClassificationLimits = DEFAULT_CLASSIFICATION_LIMITS,
): Promise<RepositoryClassificationInput> {
  const files: RepositoryFile[] = [];
  const totals = { bytes: 0, count: 0 };

  let dirExists = false;
  try {
    const s = await stat(workspaceDir);
    dirExists = s.isDirectory();
  } catch { /* not yet created */ }

  if (dirExists) {
    await walkDir(workspaceDir, workspaceDir, files, limits, totals);
  }

  return {
    repositoryRoot: workspaceDir,
    files,
    sourceMode: "local-complete",
  };
}

// ── GitHub source adapter ─────────────────────────────────────────────────────

type GitHubTreeItem = {
  path: string;
  type: "blob" | "tree";
  size?: number;
};

/**
 * Fetch the repository file tree and selectively load content for classifier-
 * relevant files. Returns a github-partial RepositoryClassificationInput.
 *
 * @param repoFull  "owner/repo" format
 * @param token     Plain-text GitHub access token
 */
export async function loadFromGitHub(
  repoFull: string,
  token: string,
  limits: ClassificationLimits = DEFAULT_CLASSIFICATION_LIMITS,
): Promise<RepositoryClassificationInput> {
  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
  };

  // Try main branch, fall back to master
  let tree: GitHubTreeItem[] = [];
  for (const branch of ["main", "master", "HEAD"]) {
    const resp = await fetch(
      `${GH_API}/repos/${repoFull}/git/trees/${branch}?recursive=1`,
      { headers, signal: AbortSignal.timeout(15_000) },
    );
    if (resp.ok) {
      const data = await resp.json() as { tree: GitHubTreeItem[]; truncated?: boolean };
      tree = data.tree ?? [];
      break;
    }
    if (resp.status === 409) break; // empty repo
  }

  // Collect all blob paths
  const blobs = tree
    .filter((item) => item.type === "blob" && !!item.path)
    .slice(0, limits.maxFiles);

  // Separate files to fetch content for vs path-only entries
  const toFetch = blobs.filter(
    (item) => shouldFetch(item.path) && (item.size ?? 0) <= limits.maxFileBytes,
  );

  // Fetch content for selected files (concurrency-limited to 10)
  const files: RepositoryFile[] = blobs.map((item) => ({ path: item.path }));
  const fileMap = new Map(files.map((f) => [f.path, f]));

  const CONCURRENCY = 10;
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (item) => {
        try {
          const resp = await fetch(
            `${GH_API}/repos/${repoFull}/contents/${encodeURIComponent(item.path)}`,
            { headers, signal: AbortSignal.timeout(10_000) },
          );
          if (!resp.ok) return;
          const data = await resp.json() as { encoding?: string; content?: string };
          if (data.encoding === "base64" && data.content) {
            const raw = Buffer.from(data.content.replace(/\n/g, ""), "base64");
            if (!raw.includes(0)) { // skip binary
              const content = raw.toString("utf-8");
              const entry = fileMap.get(item.path);
              if (entry) entry.content = content;
            }
          }
        } catch { /* timeout / network error — path-only is fine */ }
      }),
    );
  }

  return {
    files,
    sourceMode: "github-partial",
  };
}

// ── Router helper: pick source ────────────────────────────────────────────────

/**
 * Load classification input from the best available source for a project.
 * Prefers local-complete when the workspace directory has files; falls back to
 * GitHub when a linked repo + token are available.
 *
 * Returns null when neither source is viable.
 */
export async function loadClassificationInput(opts: {
  workspaceDir: string;
  linkedRepo?: string | null;
  githubToken?: string | null;
  limits?: ClassificationLimits;
}): Promise<RepositoryClassificationInput | null> {
  const { workspaceDir, linkedRepo, githubToken, limits } = opts;

  // Prefer local workspace when it has content
  let workspaceHasFiles = false;
  try {
    const entries = await readdir(workspaceDir);
    workspaceHasFiles = entries.length > 0;
  } catch { /* directory doesn't exist yet */ }

  if (workspaceHasFiles) {
    return loadFromWorkspace(workspaceDir, limits);
  }

  // Fall back to GitHub
  if (linkedRepo && githubToken) {
    return loadFromGitHub(linkedRepo, githubToken, limits);
  }

  return null;
}
