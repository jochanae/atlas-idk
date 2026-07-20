import type { RepositoryFile } from "../types.js";

export type WorkspacePackage = {
  /** Relative directory from repo root. Empty string ("") means the root itself. */
  directory: string;
  packageJson: Record<string, unknown>;
  isRoot: boolean;
  isWorkspaceMember: boolean;
  /** Files whose paths start with this package's directory prefix. */
  ownedFiles: RepositoryFile[];
};

export type WorkspaceInfo = {
  isMonorepo: boolean;
  workspaceGlobs: string[];
  packages: WorkspacePackage[];
  /** Package directories (or filter names) referenced in root --filter/-F scripts. */
  rootFilterRefs: string[];
};

// ── Glob matching ─────────────────────────────────────────────────────────────

/**
 * Minimal glob match supporting:
 *   "artifacts/*"   — one wildcard segment
 *   "lib/**"        — recursive wildcard
 *   "scripts"       — exact match
 *   "!legacy/*"     — negation (handled by caller, not here)
 */
export function matchesGlob(dirPath: string, glob: string): boolean {
  if (glob.startsWith("!")) return false; // negation handled by caller
  const regexStr = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex specials except * ?
    .replace(/\*\*/g, "__GLOBSTAR__")
    .replace(/\*/g, "[^/]+")
    .replace(/__GLOBSTAR__/g, ".+");
  const re = new RegExp(`^${regexStr}$`);
  return re.test(dirPath);
}

export function isNegatedGlob(glob: string): boolean {
  return glob.startsWith("!");
}

export function matchesNegatedGlob(dirPath: string, glob: string): boolean {
  return isNegatedGlob(glob) && matchesGlob(dirPath, glob.slice(1));
}

// ── YAML-level pnpm-workspace.yaml parser ─────────────────────────────────────

/**
 * Extract the `packages:` list from pnpm-workspace.yaml content.
 * Uses a line-by-line scan rather than a full YAML parser to avoid dependencies.
 */
function parsePnpmWorkspaceYaml(content: string): string[] {
  const lines = content.split("\n");
  const globs: string[] = [];
  let inPackages = false;
  for (const line of lines) {
    if (/^packages\s*:/.test(line)) { inPackages = true; continue; }
    if (inPackages) {
      if (/^\S/.test(line) && !/^\s*-/.test(line)) break; // new top-level key
      const match = line.match(/^\s+-\s+['"]?([^'"#\n]+)['"]?\s*(?:#.*)?$/);
      if (match) globs.push(match[1].trim());
    }
  }
  return globs;
}

// ── Root orchestration filter-ref extraction ──────────────────────────────────

/**
 * Extract package filter references from root scripts.
 * Looks for --filter / -F patterns in pnpm commands.
 * Returns the raw filter strings (package names or directory paths).
 */
function extractFilterRefs(scripts: Record<string, unknown>): string[] {
  const refs: string[] = [];
  for (const value of Object.values(scripts)) {
    if (typeof value !== "string") continue;
    const matches = [...value.matchAll(/(?:--filter|-F)\s+['"]?(@?[\w/@.-]+)['"]?/g)];
    for (const m of matches) {
      if (m[1]) refs.push(m[1]);
    }
  }
  return refs;
}

// ── Main discovery ─────────────────────────────────────────────────────────────

export function discoverWorkspace(files: RepositoryFile[]): WorkspaceInfo {
  const fileIndex = new Map(files.map((f) => [f.path, f]));

  // ── Find root package.json ─────────────────────────────────────────────────
  const rootPkgFile = fileIndex.get("package.json");
  let rootPkg: Record<string, unknown> = {};
  try {
    if (rootPkgFile?.content) rootPkg = JSON.parse(rootPkgFile.content) as Record<string, unknown>;
  } catch { /* malformed — treat as empty */ }

  const rootScripts = (rootPkg.scripts as Record<string, unknown> | undefined) ?? {};
  const rootFilterRefs = extractFilterRefs(rootScripts);

  // ── Detect workspace globs ─────────────────────────────────────────────────
  let workspaceGlobs: string[] = [];

  const pnpmWorkspaceFile = fileIndex.get("pnpm-workspace.yaml");
  if (pnpmWorkspaceFile?.content) {
    workspaceGlobs = parsePnpmWorkspaceYaml(pnpmWorkspaceFile.content);
  } else if (Array.isArray(rootPkg.workspaces)) {
    workspaceGlobs = (rootPkg.workspaces as unknown[]).filter(
      (g): g is string => typeof g === "string",
    );
  } else if (
    rootPkg.workspaces &&
    typeof rootPkg.workspaces === "object" &&
    !Array.isArray(rootPkg.workspaces)
  ) {
    const ws = rootPkg.workspaces as Record<string, unknown>;
    if (Array.isArray(ws.packages)) {
      workspaceGlobs = (ws.packages as unknown[]).filter(
        (g): g is string => typeof g === "string",
      );
    }
  }

  const isMonorepo =
    workspaceGlobs.length > 0 ||
    fileIndex.has("nx.json") ||
    fileIndex.has("turbo.json");

  // ── Collect all package.json files ────────────────────────────────────────
  const allPkgJsonPaths = files
    .filter((f) => f.path === "package.json" || f.path.endsWith("/package.json"))
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length); // shallowest first

  // ── Build package list ─────────────────────────────────────────────────────
  const packages: WorkspacePackage[] = [];

  for (const pkgFile of allPkgJsonPaths) {
    const directory =
      pkgFile.path === "package.json"
        ? ""
        : pkgFile.path.slice(0, pkgFile.path.lastIndexOf("/"));

    let packageJson: Record<string, unknown> = {};
    try {
      if (pkgFile.content) packageJson = JSON.parse(pkgFile.content) as Record<string, unknown>;
    } catch { /* malformed */ }

    const isRoot = directory === "";

    // Check if this directory matches a workspace glob (for non-root packages)
    const isWorkspaceMember =
      isRoot ||
      workspaceGlobs.some(
        (g) => !isNegatedGlob(g) && matchesGlob(directory, g),
      );

    // Collect files owned by this package (files under its directory)
    const prefix = isRoot ? "" : directory + "/";
    const ownedFiles = isRoot
      ? files
      : files.filter((f) => f.path.startsWith(prefix));

    packages.push({
      directory,
      packageJson,
      isRoot,
      isWorkspaceMember,
      ownedFiles,
    });
  }

  return { isMonorepo, workspaceGlobs, packages, rootFilterRefs };
}
