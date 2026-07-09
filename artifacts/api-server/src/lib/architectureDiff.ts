import { and, eq } from "drizzle-orm";
import {
  db,
  projectsTable,
  projectSourcesTable,
  projectSourceFilesTable,
  applicationModelsTable,
} from "@workspace/db";
import { scanProjectRoutes } from "@workspace/source-index";
import { getFileContent } from "./sourceIngest";

/**
 * Architecture Diff — Phase 3A step 2.
 *
 * Compares two of the user's projects across a fixed set of architecture
 * categories (routes, dependencies, data entities, components, auth
 * approach) using the same DB-backed source index that powers cross-project
 * search. Read-only, no new tables. Status per category is a simple set
 * comparison — this is a structural signal, not a semantic code review.
 */

export type DiffStatus = "same" | "similar" | "different" | "onlyA" | "onlyB" | "empty";

export type DiffCategory = {
  key: string;
  label: string;
  itemsA: string[];
  itemsB: string[];
  status: DiffStatus;
};

export type ArchitectureDiffResult = {
  projectA: { id: number; name: string };
  projectB: { id: number; name: string };
  categories: DiffCategory[];
};

const MAX_FILES_PER_PROJECT = 500;

async function loadProjectFiles(projectId: number) {
  const [source] = await db
    .select({ id: projectSourcesTable.id })
    .from(projectSourcesTable)
    .where(
      and(
        eq(projectSourcesTable.projectId, projectId),
        eq(projectSourcesTable.isPrimary, true),
      ),
    )
    .limit(1);

  if (!source) return [] as Array<{ path: string; content: string }>;

  const rows = await db
    .select({
      path: projectSourceFilesTable.path,
      content: projectSourceFilesTable.content,
      storageKey: projectSourceFilesTable.storageKey,
      exports: projectSourceFilesTable.exports,
      imports: projectSourceFilesTable.imports,
    })
    .from(projectSourceFilesTable)
    .where(eq(projectSourceFilesTable.sourceId, source.id))
    .limit(MAX_FILES_PER_PROJECT);

  const files: Array<{
    path: string;
    content: string;
    exports: unknown;
    imports: unknown;
  }> = [];
  for (const row of rows) {
    const content = await getFileContent(row);
    if (content == null) continue;
    files.push({ path: row.path, content, exports: row.exports, imports: row.imports });
  }
  return files;
}

function parsePackageJsonDeps(files: Array<{ path: string; content: string }>): string[] {
  const pkg = files.find((f) => f.path === "package.json" || f.path.endsWith("/package.json"));
  if (!pkg) return [];
  try {
    const parsed = JSON.parse(pkg.content);
    const deps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
    return Object.keys(deps).sort();
  } catch {
    return [];
  }
}

const AUTH_SIGNALS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Replit Auth", pattern: /replit.?auth|openid-client/i },
  { label: "Clerk", pattern: /@clerk\// },
  { label: "Passport", pattern: /passport/i },
  { label: "Supabase Auth", pattern: /supabase.*auth|auth.*supabase/i },
  { label: "Custom session/JWT", pattern: /jsonwebtoken|express-session|bcrypt/i },
];

function detectAuthApproaches(files: Array<{ path: string; content: string }>): string[] {
  const found = new Set<string>();
  for (const file of files) {
    for (const signal of AUTH_SIGNALS) {
      if (signal.pattern.test(file.content) || signal.pattern.test(file.path)) {
        found.add(signal.label);
      }
    }
  }
  return Array.from(found).sort();
}

function detectComponents(files: Array<{ path: string; exports: unknown }>): string[] {
  const names = new Set<string>();
  for (const file of files) {
    if (!/\.(tsx|jsx)$/.test(file.path)) continue;
    const exportsArr = Array.isArray(file.exports) ? (file.exports as Array<{ name?: string }>) : [];
    for (const exp of exportsArr) {
      if (exp?.name && /^[A-Z]/.test(exp.name)) names.add(exp.name);
    }
  }
  return Array.from(names).sort();
}

async function loadDataEntityNames(projectId: number): Promise<string[]> {
  const [model] = await db
    .select({ data: applicationModelsTable.data })
    .from(applicationModelsTable)
    .where(eq(applicationModelsTable.projectId, projectId))
    .limit(1);
  if (!model) return [];
  const data = model.data as { entities?: Array<{ name?: string }> } | null;
  const entities = data?.entities ?? [];
  return entities.map((e) => e.name).filter((n): n is string => Boolean(n)).sort();
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : intersection / union;
}

function computeStatus(a: string[], b: string[]): DiffStatus {
  if (a.length === 0 && b.length === 0) return "empty";
  if (a.length === 0) return "onlyB";
  if (b.length === 0) return "onlyA";
  const similarity = jaccardSimilarity(a, b);
  if (similarity >= 0.9) return "same";
  if (similarity > 0) return "similar";
  return "different";
}

function buildCategory(key: string, label: string, itemsA: string[], itemsB: string[]): DiffCategory {
  return { key, label, itemsA, itemsB, status: computeStatus(itemsA, itemsB) };
}

export async function computeArchitectureDiff(
  userId: number,
  projectAId: number,
  projectBId: number,
): Promise<ArchitectureDiffResult | null> {
  const projects = await db
    .select({ id: projectsTable.id, name: projectsTable.name, userId: projectsTable.userId })
    .from(projectsTable)
    .where(eq(projectsTable.userId, userId));

  const projectA = projects.find((p) => p.id === projectAId);
  const projectB = projects.find((p) => p.id === projectBId);
  if (!projectA || !projectB) return null;

  const [filesA, filesB] = await Promise.all([
    loadProjectFiles(projectAId),
    loadProjectFiles(projectBId),
  ]);

  const [entitiesA, entitiesB] = await Promise.all([
    loadDataEntityNames(projectAId),
    loadDataEntityNames(projectBId),
  ]);

  const routesA = scanProjectRoutes(filesA).map((r) => r.path).filter(Boolean);
  const routesB = scanProjectRoutes(filesB).map((r) => r.path).filter(Boolean);

  const depsA = parsePackageJsonDeps(filesA);
  const depsB = parsePackageJsonDeps(filesB);

  const componentsA = detectComponents(filesA as unknown as Array<{ path: string; exports: unknown }>);
  const componentsB = detectComponents(filesB as unknown as Array<{ path: string; exports: unknown }>);

  const authA = detectAuthApproaches(filesA);
  const authB = detectAuthApproaches(filesB);

  const categories: DiffCategory[] = [
    buildCategory("routes", "Routes", [...new Set(routesA)].sort(), [...new Set(routesB)].sort()),
    buildCategory("dependencies", "Dependencies", depsA, depsB),
    buildCategory("dataEntities", "Data Entities", entitiesA, entitiesB),
    buildCategory("components", "Components", componentsA, componentsB),
    buildCategory("auth", "Authentication", authA, authB),
  ];

  return {
    projectA: { id: projectA.id, name: projectA.name },
    projectB: { id: projectB.id, name: projectB.name },
    categories,
  };
}
