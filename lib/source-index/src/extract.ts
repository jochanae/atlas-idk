/**
 * Shared export/import extraction — ported from
 * artifacts/api-server/src/routes/selfmap.ts and extended with line numbers
 * + kind metadata for the per-project source index.
 */

export type ExtractedExport = {
  name: string;
  kind: string;
  line: number;
};

export type ExtractedImport = {
  specifier: string;
  resolvedPath: string | null;
  line: number;
};

const IMPORT_EXTENSIONS = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
];

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Extract named/default exports with kind + 1-indexed line.
 * Regex first-pass (Phase 1); tree-sitter upgrades in Phase 2.
 */
export function extractExports(content: string): ExtractedExport[] {
  const seen = new Map<string, ExtractedExport>();

  const patterns: Array<{ re: RegExp; kind: string }> = [
    { re: /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, kind: "function" },
    { re: /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g, kind: "const" },
    { re: /export\s+class\s+([A-Za-z_$][\w$]*)/g, kind: "class" },
    { re: /export\s+interface\s+([A-Za-z_$][\w$]*)/g, kind: "interface" },
    { re: /export\s+type\s+([A-Za-z_$][\w$]*)/g, kind: "type" },
    { re: /export\s+enum\s+([A-Za-z_$][\w$]*)/g, kind: "enum" },
    { re: /export\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)?/g, kind: "default" },
    { re: /export\s+default\s+class\s+([A-Za-z_$][\w$]*)?/g, kind: "default" },
  ];

  for (const { re, kind } of patterns) {
    for (const match of content.matchAll(re)) {
      const name = match[1] ?? "default";
      const key = `${name}:${kind}`;
      if (!seen.has(key)) {
        seen.set(key, { name, kind, line: lineOf(content, match.index ?? 0) });
      }
    }
  }

  for (const match of content.matchAll(/export\s*\{([^}]+)\}/g)) {
    const exported = match[1] ?? "";
    const baseLine = lineOf(content, match.index ?? 0);
    for (const part of exported.split(",")) {
      const name = part.trim().split(/\s+as\s+/i).pop()?.trim();
      if (!name) continue;
      const key = `${name}:named`;
      if (!seen.has(key)) {
        seen.set(key, { name, kind: "named", line: baseLine });
      }
    }
  }

  // export default <expr>
  for (const match of content.matchAll(/export\s+default\s+(?!function|class|async)([A-Za-z_$][\w$]*)/g)) {
    const name = match[1] ?? "default";
    const key = `${name}:default`;
    if (!seen.has(key)) {
      seen.set(key, { name, kind: "default", line: lineOf(content, match.index ?? 0) });
    }
  }

  return [...seen.values()].sort((a, b) => a.line - b.line || a.name.localeCompare(b.name));
}

/**
 * Extract import/re-export module specifiers with line numbers.
 * Does not resolve paths — call resolveImport separately.
 */
export function extractImportSpecifiers(content: string): Array<{ specifier: string; line: number }> {
  const out: Array<{ specifier: string; line: number }> = [];
  const seen = new Set<string>();
  const re =
    /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of content.matchAll(re)) {
    const specifier = match[1];
    if (!specifier) continue;
    const line = lineOf(content, match.index ?? 0);
    const key = `${specifier}@${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ specifier, line });
  }
  // dynamic import("...")
  for (const match of content.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const specifier = match[1];
    if (!specifier) continue;
    const line = lineOf(content, match.index ?? 0);
    const key = `${specifier}@${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ specifier, line });
  }
  return out;
}

export type ResolveImportOptions = {
  /** Absolute or virtual root used for @/ alias resolution. */
  root: string;
  /** Set of known relative POSIX paths (no leading slash). */
  knownFiles: Set<string>;
  /**
   * Alias map: prefix → relative root under `root`.
   * Default: { "@/": "src/" } for typical Vite apps.
   * Pass { "@/": "artifacts/atlas/src/" } for Atlas self-map.
   */
  aliases?: Record<string, string>;
};

/**
 * Resolve a relative or aliased import specifier against known files.
 * Returns a POSIX relative path or null if unresolved (package imports).
 */
export function resolveImport(
  fromFile: string,
  specifier: string,
  options: ResolveImportOptions,
): string | null {
  const { root, knownFiles } = options;
  const aliases = options.aliases ?? { "@/": "src/" };

  let targetBase: string | null = null;

  if (specifier.startsWith(".")) {
    // fromFile is absolute or root-relative POSIX
    const fromDir = toPosix(fromFile).includes("/")
      ? toPosix(fromFile).slice(0, toPosix(fromFile).lastIndexOf("/"))
      : "";
    const joined = toPosix(
      // simple relative join without node:path so this package stays dep-light
      resolveRelative(fromDir, specifier),
    );
    targetBase = joined;
  } else {
    for (const [prefix, aliasRoot] of Object.entries(aliases)) {
      if (specifier.startsWith(prefix)) {
        const rest = specifier.slice(prefix.length);
        const aliasBase = toPosix(aliasRoot).replace(/\/$/, "");
        targetBase = aliasBase ? `${aliasBase}/${rest}` : rest;
        break;
      }
    }
  }

  if (!targetBase) return null;

  // Normalize away leading ./ and collapse ..
  targetBase = normalizePosix(targetBase);

  for (const suffix of IMPORT_EXTENSIONS) {
    const candidate = normalizePosix(`${targetBase}${suffix}`);
    if (knownFiles.has(candidate)) return candidate;
  }

  // Also try against absolute-style known files that include root prefix
  void root;
  return null;
}

function resolveRelative(fromDir: string, specifier: string): string {
  const parts = (fromDir ? fromDir.split("/") : []).filter((p) => p && p !== ".");
  for (const seg of specifier.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join("/");
}

function normalizePosix(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join("/");
}

/** Convenience: extract imports and resolve them in one pass. */
export function extractAndResolveImports(
  content: string,
  fromFile: string,
  options: ResolveImportOptions,
): ExtractedImport[] {
  return extractImportSpecifiers(content).map(({ specifier, line }) => ({
    specifier,
    resolvedPath: resolveImport(fromFile, specifier, options),
    line,
  }));
}

/** Legacy string[] export names (for selfmap compatibility). */
export function extractExportNames(content: string): string[] {
  return [...new Set(extractExports(content).map((e) => e.name))].sort();
}
