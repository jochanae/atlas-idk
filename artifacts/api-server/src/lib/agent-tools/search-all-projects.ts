import { tool } from "ai";
import { z } from "zod";
import { eq, and, ne } from "drizzle-orm";
import {
  db,
  projectsTable,
  projectSourcesTable,
  projectSourceFilesTable,
} from "@workspace/db";
import { getFileContent } from "../sourceIngest";
import type { AgentToolContext } from "./context";

/**
 * Cross-Project Search — Phase 3A step 1.
 *
 * Searches the INDEXED content (project_source_files, DB-backed, same store the
 * Codebase panel search UI reads from) across every project the user owns, not
 * just the active one. This is what lets Atlas answer "have I built this
 * before?" or "how did I do auth in my other apps?" with real file/line
 * citations instead of guessing from memory/ledger text.
 *
 * Distinct from `search_codebase` (ripgrep over the CURRENT project's live
 * workspace dir only) and `read_reference_project_file` (single named project,
 * browse+read). This tool is the "search everywhere at once" primitive; Atlas
 * should still use read_reference_project_file to pull full file content once
 * a promising hit is found here.
 */

const MAX_HITS = 60;
const MAX_FILES_SCANNED_PER_PROJECT = 400;

function buildPattern(q: string, type: "literal" | "regex"): RegExp | null {
  try {
    return type === "regex"
      ? new RegExp(q, "g")
      : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  } catch {
    return null;
  }
}

export function searchAllProjectsTool(ctx: AgentToolContext) {
  return tool({
    description:
      "Search across ALL of the user's projects at once (not just the active one) for a concept, component, route, hook, schema field, or literal phrase. Returns project name + file path + line + preview for every match, so you can answer 'have I built this before' / 'how did I do X in my other apps' with real citations. Use this BEFORE claiming you don't know, and before read_reference_project_file (which needs a specific project+path this tool can supply).",
    inputSchema: z.object({
      query: z.string().min(1).describe("Concept, symbol, route, or phrase to search for"),
      type: z.enum(["literal", "regex"]).default("literal"),
      includeCurrentProject: z
        .boolean()
        .default(true)
        .describe("Whether to also search the project the user is currently in"),
    }),
    execute: async ({ query, type, includeCurrentProject }) => {
      const started = performance.now();
      ctx.emitToolCall("search_all_projects", { query, type });
      try {
        const pattern = buildPattern(query, type);
        if (!pattern) {
          ctx.emitToolResult("search_all_projects", false, Math.round(performance.now() - started));
          return { error: "Invalid regex", hits: [] };
        }

        const projectFilter = includeCurrentProject
          ? eq(projectsTable.userId, ctx.userId)
          : and(eq(projectsTable.userId, ctx.userId), ne(projectsTable.id, ctx.projectId));

        const ownedProjects = await db
          .select({ id: projectsTable.id, name: projectsTable.name })
          .from(projectsTable)
          .where(projectFilter);

        if (ownedProjects.length === 0) {
          ctx.emitToolResult("search_all_projects", true, Math.round(performance.now() - started));
          return { hits: [], projectsSearched: 0 };
        }

        const projectById = new Map(ownedProjects.map((p) => [p.id, p.name]));

        const primarySources = await db
          .select({
            id: projectSourcesTable.id,
            projectId: projectSourcesTable.projectId,
          })
          .from(projectSourcesTable)
          .where(
            and(
              eq(projectSourcesTable.isPrimary, true),
            ),
          );

        const relevantSources = primarySources.filter((s) => projectById.has(s.projectId));

        type Hit = {
          projectId: number;
          projectName: string;
          path: string;
          line: number;
          preview: string;
        };
        const hits: Hit[] = [];

        outer: for (const source of relevantSources) {
          const projectName = projectById.get(source.projectId)!;
          const files = await db
            .select({
              path: projectSourceFilesTable.path,
              content: projectSourceFilesTable.content,
              storageKey: projectSourceFilesTable.storageKey,
            })
            .from(projectSourceFilesTable)
            .where(eq(projectSourceFilesTable.sourceId, source.id))
            .limit(MAX_FILES_SCANNED_PER_PROJECT);

          for (const file of files) {
            if (hits.length >= MAX_HITS) break outer;
            const content = await getFileContent(file);
            if (!content) continue;
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (hits.length >= MAX_HITS) break;
              const line = lines[i]!;
              pattern.lastIndex = 0;
              if (!pattern.test(line)) continue;
              hits.push({
                projectId: source.projectId,
                projectName,
                path: file.path,
                line: i + 1,
                preview: line.trim().slice(0, 240),
              });
            }
          }
        }

        ctx.writeStep({
          verb: "SOURCE_REFERENCED",
          target: `cross-project search: "${query}" (${hits.length} hits across ${new Set(hits.map((h) => h.projectId)).size} project(s))`,
          phase: "reference",
        });
        ctx.emitToolResult("search_all_projects", true, Math.round(performance.now() - started));
        return {
          hits,
          projectsSearched: relevantSources.length,
          capped: hits.length >= MAX_HITS,
        };
      } catch (err) {
        ctx.emitToolResult("search_all_projects", false, Math.round(performance.now() - started));
        return { error: String(err), hits: [] };
      }
    },
  });
}
