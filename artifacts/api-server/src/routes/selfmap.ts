import { Router, type IRouter } from "express";
import { readdir, readFile, stat } from "fs/promises";
import * as nodePath from "path";
import { atlasSelfMapTable, db } from "@workspace/db";
import {
  extractExportNames,
  extractImportSpecifiers,
  resolveImport,
} from "@workspace/source-index";

type IndexedFile = {
  path: string;
  size: number;
  exports: string[];
  internalImports: string[];
};

type SelfMap = {
  generatedAt: string;
  roots: string[];
  files: IndexedFile[];
  relationships: Array<{ from: string; to: string }>;
};

const router: IRouter = Router();
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".css"]);

function workspaceRoot() {
  return process.env.WORKSPACE_ROOT ?? process.cwd();
}

function toRelativePath(root: string, filePath: string) {
  return nodePath.relative(root, filePath).split(nodePath.sep).join("/");
}

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = nodePath.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath);
    if (!entry.isFile()) return [];
    return [fullPath];
  }));
  return files.flat();
}

export async function buildSelfMap(): Promise<{ file_count: number; created_at: Date }> {
  const root = workspaceRoot();
  const sourceRoots = [
    nodePath.join(root, "artifacts/atlas/src"),
    nodePath.join(root, "artifacts/api-server/src"),
  ];
  const absoluteFiles = (await Promise.all(sourceRoots.map((sourceRoot) => collectFiles(sourceRoot)))).flat().sort();
  const knownFiles = new Set(absoluteFiles.map((filePath) => toRelativePath(root, filePath)));
  const files: IndexedFile[] = [];
  const aliases = { "@/": "artifacts/atlas/src/" };

  for (const filePath of absoluteFiles) {
    const fileStat = await stat(filePath);
    const content = TEXT_EXTENSIONS.has(nodePath.extname(filePath))
      ? await readFile(filePath, "utf-8")
      : "";
    const relativePath = toRelativePath(root, filePath);
    const internalImports = extractImportSpecifiers(content)
      .map(({ specifier }) =>
        resolveImport(relativePath, specifier, { root, knownFiles, aliases }),
      )
      .filter((target): target is string => target !== null);

    files.push({
      path: relativePath,
      size: fileStat.size,
      exports: extractExportNames(content),
      internalImports,
    });
  }

  const selfMap: SelfMap = {
    generatedAt: new Date().toISOString(),
    roots: sourceRoots.map((sourceRoot) => toRelativePath(root, sourceRoot)),
    files,
    relationships: files.flatMap((file) => file.internalImports.map((target) => ({ from: file.path, to: target }))),
  };

  await db.delete(atlasSelfMapTable);
  const [row] = await db
    .insert(atlasSelfMapTable)
    .values({ mapJson: JSON.stringify(selfMap), fileCount: files.length })
    .returning({ fileCount: atlasSelfMapTable.fileCount, createdAt: atlasSelfMapTable.createdAt });

  if (!row) throw new Error("Failed to store self map");
  return { file_count: row.fileCount, created_at: row.createdAt };
}

router.post("/selfmap/refresh", async (_req, res): Promise<void> => {
  const result = await buildSelfMap();
  res.json({ file_count: result.file_count, created_at: result.created_at.toISOString() });
});

export default router;
