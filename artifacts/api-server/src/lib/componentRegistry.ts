import { and, eq } from "drizzle-orm";
import {
  db,
  projectsTable,
  projectSourcesTable,
  projectSourceFilesTable,
} from "@workspace/db";
import { getFileContent } from "./sourceIngest";

/**
 * Shared Component Registry — Phase 3B step 2.
 *
 * Scans every owned project's primary source for exported React components
 * (.tsx/.jsx files, capitalized export names) and groups matches by name
 * across projects. Groups that appear in 2+ projects are duplicate/extraction
 * candidates — "you've built a Modal 4 times, want to promote one to shared?"
 * Read-only, no new tables — reuses the same DB-backed source index as
 * cross-project search, architecture diff, and project knowledge.
 */

const MAX_FILES_SCANNED_PER_PROJECT = 600;
const IGNORED_NAME_PATTERN = /^(Provider|Context|Props|Type)$/;

export type ComponentOccurrence = {
  projectId: number;
  projectName: string;
  path: string;
  lineCount: number;
  updatedAt: string;
};

export type ComponentGroup = {
  name: string;
  occurrences: ComponentOccurrence[];
  projectCount: number;
  isDuplicate: boolean;
};

export type ComponentRegistryResult = {
  groups: ComponentGroup[];
  totalComponents: number;
  totalProjects: number;
};

function isComponentExportName(name: string): boolean {
  if (!/^[A-Z]/.test(name)) return false;
  if (IGNORED_NAME_PATTERN.test(name)) return false;
  return true;
}

function extractComponentNames(content: string): string[] {
  const names = new Set<string>();
  const patterns: RegExp[] = [
    /export\s+(?:default\s+)?function\s+([A-Z][\w$]*)/g,
    /export\s+(?:default\s+)?const\s+([A-Z][\w$]*)\s*(?::[^=]+)?=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]*)?=>/g,
    /export\s+(?:default\s+)?class\s+([A-Z][\w$]*)\s+extends\s+(?:React\.)?Component/g,
  ];
  for (const re of patterns) {
    for (const match of content.matchAll(re)) {
      const name = match[1];
      if (name && isComponentExportName(name)) names.add(name);
    }
  }
  return Array.from(names);
}

export async function computeComponentRegistry(userId: number): Promise<ComponentRegistryResult> {
  const ownedProjects = await db
    .select({ id: projectsTable.id, name: projectsTable.name })
    .from(projectsTable)
    .where(eq(projectsTable.userId, userId));

  if (ownedProjects.length === 0) {
    return { groups: [], totalComponents: 0, totalProjects: 0 };
  }

  const projectById = new Map(ownedProjects.map((p) => [p.id, p]));

  const primarySources = await db
    .select({ id: projectSourcesTable.id, projectId: projectSourcesTable.projectId })
    .from(projectSourcesTable)
    .where(eq(projectSourcesTable.isPrimary, true));

  const relevantSources = primarySources.filter((s) => projectById.has(s.projectId));

  const groupMap = new Map<string, ComponentGroup>();

  for (const source of relevantSources) {
    const project = projectById.get(source.projectId)!;
    const files = await db
      .select({
        path: projectSourceFilesTable.path,
        content: projectSourceFilesTable.content,
        storageKey: projectSourceFilesTable.storageKey,
        indexedAt: projectSourceFilesTable.indexedAt,
      })
      .from(projectSourceFilesTable)
      .where(eq(projectSourceFilesTable.sourceId, source.id))
      .limit(MAX_FILES_SCANNED_PER_PROJECT);

    for (const file of files) {
      if (!/\.(tsx|jsx)$/.test(file.path)) continue;
      // Skip test/story files — not real implementation candidates.
      if (/\.(test|spec|stories)\./i.test(file.path)) continue;

      const content = await getFileContent(file);
      if (!content) continue;

      const names = extractComponentNames(content);
      if (names.length === 0) continue;

      const lineCount = content.split("\n").length;
      const occurrence: ComponentOccurrence = {
        projectId: project.id,
        projectName: project.name,
        path: file.path,
        lineCount,
        updatedAt: new Date(file.indexedAt as unknown as string).toISOString(),
      };

      for (const name of names) {
        let group = groupMap.get(name);
        if (!group) {
          group = { name, occurrences: [], projectCount: 0, isDuplicate: false };
          groupMap.set(name, group);
        }
        // Avoid double-counting the same component defined twice in one file.
        if (!group.occurrences.some((o) => o.projectId === project.id && o.path === file.path)) {
          group.occurrences.push(occurrence);
        }
      }
    }
  }

  const groups = Array.from(groupMap.values()).map((g) => {
    const projectCount = new Set(g.occurrences.map((o) => o.projectId)).size;
    return { ...g, projectCount, isDuplicate: projectCount >= 2 };
  });

  groups.sort((a, b) => {
    if (a.isDuplicate !== b.isDuplicate) return a.isDuplicate ? -1 : 1;
    if (b.projectCount !== a.projectCount) return b.projectCount - a.projectCount;
    return a.name.localeCompare(b.name);
  });

  return {
    groups,
    totalComponents: groups.length,
    totalProjects: ownedProjects.length,
  };
}
