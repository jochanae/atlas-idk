import { and, eq } from "drizzle-orm";
import {
  db,
  projectsTable,
  projectSourcesTable,
  projectSourceFilesTable,
} from "@workspace/db";
import { getFileContent } from "./sourceIngest";

/**
 * Project Knowledge — Phase 3B.
 *
 * "Show me every invite flow I've ever built" — groups cross-project search
 * hits by project and scores each project's implementation on maturity, so
 * the user can see not just WHERE a concept exists but WHICH version of it
 * is most complete. Reuses the exact same DB-backed index as
 * search_all_projects; adds a scoring layer on top. No new tables.
 */

const MAX_FILES_SCANNED_PER_PROJECT = 400;
const MAX_MATCHED_FILES = 15;

export type ProjectKnowledgeEntry = {
  projectId: number;
  projectName: string;
  matchedFiles: Array<{ path: string; line: number; preview: string }>;
  fileCount: number;
  hitCount: number;
  hasTests: boolean;
  daysSinceUpdate: number;
  maturityScore: number; // 0-100
  stars: number; // 1-5
};

export type ProjectKnowledgeResult = {
  concept: string;
  projects: ProjectKnowledgeEntry[];
};

function buildPattern(q: string): RegExp | null {
  try {
    return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  } catch {
    return null;
  }
}

function scoreMaturity(entry: {
  hitCount: number;
  fileCount: number;
  hasTests: boolean;
  daysSinceUpdate: number;
}): number {
  // Breadth: how many distinct files touch this concept (caps at 8 files = full credit)
  const breadth = Math.min(entry.fileCount / 8, 1) * 40;
  // Depth: how many total mentions/hits (caps at 20 hits = full credit)
  const depth = Math.min(entry.hitCount / 20, 1) * 25;
  // Test coverage signal
  const tests = entry.hasTests ? 15 : 0;
  // Recency: fresher implementations score higher, decays over ~180 days
  const recency = Math.max(0, 1 - entry.daysSinceUpdate / 180) * 20;
  return Math.round(Math.min(100, breadth + depth + tests + recency));
}

function starsFromScore(score: number): number {
  if (score >= 80) return 5;
  if (score >= 60) return 4;
  if (score >= 40) return 3;
  if (score >= 20) return 2;
  return 1;
}

export async function computeProjectKnowledge(
  userId: number,
  concept: string,
): Promise<ProjectKnowledgeResult> {
  const pattern = buildPattern(concept);
  if (!pattern) return { concept, projects: [] };

  const ownedProjects = await db
    .select({ id: projectsTable.id, name: projectsTable.name, updatedAt: projectsTable.updatedAt })
    .from(projectsTable)
    .where(eq(projectsTable.userId, userId));

  if (ownedProjects.length === 0) return { concept, projects: [] };

  const projectById = new Map(ownedProjects.map((p) => [p.id, p]));

  const primarySources = await db
    .select({ id: projectSourcesTable.id, projectId: projectSourcesTable.projectId })
    .from(projectSourcesTable)
    .where(eq(projectSourcesTable.isPrimary, true));

  const relevantSources = primarySources.filter((s) => projectById.has(s.projectId));

  const results: ProjectKnowledgeEntry[] = [];

  for (const source of relevantSources) {
    const project = projectById.get(source.projectId)!;
    const files = await db
      .select({
        path: projectSourceFilesTable.path,
        content: projectSourceFilesTable.content,
        storageKey: projectSourceFilesTable.storageKey,
      })
      .from(projectSourceFilesTable)
      .where(eq(projectSourceFilesTable.sourceId, source.id))
      .limit(MAX_FILES_SCANNED_PER_PROJECT);

    const matchedFiles: Array<{ path: string; line: number; preview: string }> = [];
    let hitCount = 0;
    let hasTests = false;
    const matchedPaths = new Set<string>();

    for (const file of files) {
      const content = await getFileContent(file);
      if (!content) continue;
      pattern.lastIndex = 0;
      if (!pattern.test(content)) continue;

      matchedPaths.add(file.path);
      if (/\.(test|spec)\./i.test(file.path)) hasTests = true;

      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        pattern.lastIndex = 0;
        if (!pattern.test(lines[i]!)) continue;
        hitCount++;
        if (matchedFiles.length < MAX_MATCHED_FILES) {
          matchedFiles.push({ path: file.path, line: i + 1, preview: lines[i]!.trim().slice(0, 200) });
        }
      }
    }

    if (matchedPaths.size === 0) continue;

    const daysSinceUpdate = Math.max(
      0,
      Math.floor((Date.now() - new Date(project.updatedAt).getTime()) / (1000 * 60 * 60 * 24)),
    );

    const maturityScore = scoreMaturity({
      hitCount,
      fileCount: matchedPaths.size,
      hasTests,
      daysSinceUpdate,
    });

    results.push({
      projectId: project.id,
      projectName: project.name,
      matchedFiles,
      fileCount: matchedPaths.size,
      hitCount,
      hasTests,
      daysSinceUpdate,
      maturityScore,
      stars: starsFromScore(maturityScore),
    });
  }

  results.sort((a, b) => b.maturityScore - a.maturityScore);

  return { concept, projects: results };
}
