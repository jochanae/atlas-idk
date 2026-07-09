import { readdir, stat } from "fs/promises";
import * as nodePath from "path";

export const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  "__pycache__",
  ".venv",
  "venv",
  ".cache",
  "coverage",
  ".nyc_output",
  ".output",
  "out",
]);

export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
export const INLINE_CONTENT_LIMIT = 65536; // 64 KB

const BINARY_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "svg",
  "woff", "woff2", "ttf", "eot", "otf",
  "mp3", "mp4", "wav", "webm", "mov",
  "pdf", "zip", "gz", "tar", "bz2", "7z", "rar",
  "exe", "dll", "so", "dylib", "bin",
  "wasm", "lock",
]);

export function shouldSkipPath(relativePath: string): boolean {
  const parts = relativePath.split("/").filter(Boolean);
  return parts.some((p) => {
    if (SKIP_DIRS.has(p)) return true;
    // skip hidden dirs/files except common config
    if (p.startsWith(".") && p !== ".env" && p !== ".gitignore" && p !== ".dockerignore") {
      return true;
    }
    return false;
  });
}

export function isLikelyBinary(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return BINARY_EXT.has(ext);
}

export type WalkedFile = {
  absolutePath: string;
  relativePath: string;
  sizeBytes: number;
};

/**
 * Recursively walk a directory, returning text-ish files under size limit.
 */
export async function walkSourceTree(rootDir: string): Promise<WalkedFile[]> {
  const out: WalkedFile[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = nodePath.join(dir, entry.name);
      const rel = nodePath.relative(rootDir, abs).split(nodePath.sep).join("/");
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || (entry.name.startsWith(".") && entry.name !== ".env")) {
          continue;
        }
        await walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (shouldSkipPath(rel)) continue;
      if (isLikelyBinary(rel)) continue;
      let sizeBytes = 0;
      try {
        const s = await stat(abs);
        sizeBytes = s.size;
      } catch {
        continue;
      }
      if (sizeBytes > MAX_FILE_BYTES) continue;
      out.push({ absolutePath: abs, relativePath: rel, sizeBytes });
    }
  }

  await walk(rootDir);
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return out;
}

/** Build a nested tree from flat path list. */
export type TreeNode = {
  name: string;
  path: string;
  type: "file" | "dir";
  sizeBytes?: number;
  language?: string | null;
  children?: TreeNode[];
};

export function buildFileTree(
  files: Array<{ path: string; sizeBytes: number; language?: string | null }>,
  depth?: number,
): TreeNode[] {
  type Mutable = TreeNode & { childrenMap?: Map<string, Mutable> };
  const root: Mutable = { name: "", path: "", type: "dir", childrenMap: new Map() };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let cursor = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isFile = i === parts.length - 1;
      const childPath = parts.slice(0, i + 1).join("/");
      if (!cursor.childrenMap) cursor.childrenMap = new Map();
      let child = cursor.childrenMap.get(part);
      if (!child) {
        child = {
          name: part,
          path: childPath,
          type: isFile ? "file" : "dir",
          ...(isFile ? { sizeBytes: file.sizeBytes, language: file.language ?? null } : {}),
          childrenMap: isFile ? undefined : new Map(),
        };
        cursor.childrenMap.set(part, child);
      }
      if (!isFile) cursor = child;
    }
  }

  function materialize(node: Mutable, currentDepth: number): TreeNode {
    const base: TreeNode = {
      name: node.name,
      path: node.path,
      type: node.type,
      ...(node.type === "file"
        ? { sizeBytes: node.sizeBytes, language: node.language }
        : {}),
    };
    if (node.type === "dir" && node.childrenMap) {
      if (depth != null && currentDepth >= depth) {
        base.children = [];
        return base;
      }
      base.children = [...node.childrenMap.values()]
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .map((c) => materialize(c, currentDepth + 1));
    }
    return base;
  }

  if (!root.childrenMap) return [];
  return [...root.childrenMap.values()]
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((c) => materialize(c, 1));
}
