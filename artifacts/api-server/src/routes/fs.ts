import { Router, type Request, type Response, type IRouter } from "express";
import fsNode from "fs";
import fsPromises from "fs/promises";
import path from "path";
import {
  projectWorkspaceDir,
  ensureProjectWorkspaceDir,
  resolveWorkspacePath,
  assertProjectOwner,
} from "../lib/projectWorkspace";

const router: IRouter = Router();

const MAX_FILE_BYTES = 512_000; // 500 KB

function queryString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

const EXCLUDED_NAMES = new Set([
  "node_modules", ".git", "dist", ".next", "__pycache__",
  ".cache", "coverage", ".turbo", "build", ".svelte-kit",
  ".vercel", ".output", "out",
]);

function parseProjectId(value: unknown): number | null {
  const s = Array.isArray(value) ? value[0] : value;
  const id = Number(s);
  return Number.isInteger(id) && id > 0 ? id : null;
}

interface FsNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: FsNode[];
}

async function buildTree(absDir: string, relBase: string, depth = 0): Promise<FsNode[]> {
  if (depth > 6) return [];
  let entries: fsNode.Dirent[];
  try {
    entries = await fsPromises.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  const nodes: FsNode[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (EXCLUDED_NAMES.has(entry.name)) continue;

    const nodePath = relBase ? `${relBase}/${entry.name}` : entry.name;
    const absPath = path.join(absDir, entry.name);

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: nodePath,
        type: "dir",
        children: await buildTree(absPath, nodePath, depth + 1),
      });
    } else if (entry.isFile()) {
      let size = 0;
      try {
        const stat = await fsPromises.stat(absPath);
        size = stat.size;
      } catch { /* skip */ }
      nodes.push({ name: entry.name, path: nodePath, type: "file", size });
    }
  }
  return nodes;
}

function looksLikeBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return true;
  }
  return false;
}

// GET /api/fs/:projectId/tree
router.get("/fs/:projectId/tree", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;
    const projectId = parseProjectId(req.params.projectId);
    if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }
    if (!await assertProjectOwner(projectId, userId)) { res.status(404).json({ error: "Project not found" }); return; }

    const workspaceDir = await ensureProjectWorkspaceDir(projectId);
    const children = await buildTree(workspaceDir, "", 0);
    res.json({
      name: "",
      path: "",
      type: "dir",
      workspaceDir,
      children,
    });
  } catch (err) {
    req.log?.error({ err }, "fs tree error");
    res.status(500).json({ error: "Failed to read file tree" });
  }
});

// GET /api/fs/:projectId/file?path=...
router.get("/fs/:projectId/file", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;
    const projectId = parseProjectId(req.params.projectId);
    if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }
    if (!await assertProjectOwner(projectId, userId)) { res.status(404).json({ error: "Project not found" }); return; }

    const userPath = queryString(req.query.path);
    if (!userPath) { res.status(400).json({ error: "Missing path" }); return; }

    const workspaceDir = projectWorkspaceDir(projectId);
    let absPath: string;
    try {
      absPath = resolveWorkspacePath(workspaceDir, userPath);
    } catch {
      res.status(400).json({ error: "Invalid path" }); return;
    }

    let stat: fsNode.Stats;
    try {
      stat = await fsPromises.stat(absPath);
    } catch {
      res.status(404).json({ error: "File not found" }); return;
    }

    if (!stat.isFile()) { res.status(400).json({ error: "Not a file" }); return; }
    if (stat.size > MAX_FILE_BYTES) {
      res.status(413).json({ error: `File too large to open in editor (${Math.round(stat.size / 1024)} KB — max 500 KB)` });
      return;
    }

    const buf = await fsPromises.readFile(absPath);
    if (looksLikeBinary(buf)) {
      res.status(415).json({ error: "Binary file — cannot open in text editor" }); return;
    }

    res.json({ path: userPath, content: buf.toString("utf-8"), size: stat.size });
  } catch (err) {
    req.log?.error({ err }, "fs file read error");
    res.status(500).json({ error: "Failed to read file" });
  }
});

// POST /api/fs/:projectId/file  { path, content }
router.post("/fs/:projectId/file", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;
    const projectId = parseProjectId(req.params.projectId);
    if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }
    if (!await assertProjectOwner(projectId, userId)) { res.status(404).json({ error: "Project not found" }); return; }

    const { path: userPath, content } = req.body as { path?: string; content?: string };
    if (!userPath) { res.status(400).json({ error: "Missing path" }); return; }
    if (typeof content !== "string") { res.status(400).json({ error: "Missing content" }); return; }

    const byteLen = Buffer.byteLength(content, "utf-8");
    if (byteLen > MAX_FILE_BYTES) {
      res.status(413).json({ error: "Content too large (max 500 KB)" }); return;
    }

    const workspaceDir = await ensureProjectWorkspaceDir(projectId);
    let absPath: string;
    try {
      absPath = resolveWorkspacePath(workspaceDir, userPath);
    } catch {
      res.status(400).json({ error: "Invalid path" }); return;
    }

    await fsPromises.mkdir(path.dirname(absPath), { recursive: true });
    await fsPromises.writeFile(absPath, content, "utf-8");
    res.json({ ok: true, path: userPath });
  } catch (err) {
    req.log?.error({ err }, "fs file write error");
    res.status(500).json({ error: "Failed to write file" });
  }
});

// DELETE /api/fs/:projectId/file?path=...
router.delete("/fs/:projectId/file", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;
    const projectId = parseProjectId(req.params.projectId);
    if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }
    if (!await assertProjectOwner(projectId, userId)) { res.status(404).json({ error: "Project not found" }); return; }

    const userPath = queryString(req.query.path);
    if (!userPath) { res.status(400).json({ error: "Missing path" }); return; }

    const workspaceDir = projectWorkspaceDir(projectId);
    let absPath: string;
    try {
      absPath = resolveWorkspacePath(workspaceDir, userPath);
    } catch {
      res.status(400).json({ error: "Invalid path" }); return;
    }

    await fsPromises.rm(absPath, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "fs file delete error");
    res.status(500).json({ error: "Failed to delete" });
  }
});

// POST /api/fs/:projectId/mkdir  { path }
router.post("/fs/:projectId/mkdir", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;
    const projectId = parseProjectId(req.params.projectId);
    if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }
    if (!await assertProjectOwner(projectId, userId)) { res.status(404).json({ error: "Project not found" }); return; }

    const { path: userPath } = req.body as { path?: string };
    if (!userPath) { res.status(400).json({ error: "Missing path" }); return; }

    const workspaceDir = await ensureProjectWorkspaceDir(projectId);
    let absPath: string;
    try {
      absPath = resolveWorkspacePath(workspaceDir, userPath);
    } catch {
      res.status(400).json({ error: "Invalid path" }); return;
    }

    await fsPromises.mkdir(absPath, { recursive: true });
    res.json({ ok: true, path: userPath });
  } catch (err) {
    req.log?.error({ err }, "fs mkdir error");
    res.status(500).json({ error: "Failed to create directory" });
  }
});

// POST /api/fs/:projectId/rename  { from, to }
router.post("/fs/:projectId/rename", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;
    const projectId = parseProjectId(req.params.projectId);
    if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }
    if (!await assertProjectOwner(projectId, userId)) { res.status(404).json({ error: "Project not found" }); return; }

    const { from: fromPath, to: toPath } = req.body as { from?: string; to?: string };
    if (!fromPath || !toPath) { res.status(400).json({ error: "Missing from/to" }); return; }

    const workspaceDir = projectWorkspaceDir(projectId);
    let absFrom: string, absTo: string;
    try {
      absFrom = resolveWorkspacePath(workspaceDir, fromPath);
      absTo = resolveWorkspacePath(workspaceDir, toPath);
    } catch {
      res.status(400).json({ error: "Invalid path" }); return;
    }

    await fsPromises.mkdir(path.dirname(absTo), { recursive: true });
    await fsPromises.rename(absFrom, absTo);
    res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "fs rename error");
    res.status(500).json({ error: "Failed to rename" });
  }
});

export default router;
