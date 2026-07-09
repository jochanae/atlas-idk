import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { and, eq, ne, desc } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import { projectWorkspaceDir, resolveWorkspacePath } from "../projectWorkspace";
import type { AgentToolContext } from "./context";

/**
 * Cross-Project Reference Mode — narrow, intentional, read-only.
 *
 * Atlas can browse and read files from another project owned by the SAME
 * user, purely for comparison/reuse purposes (e.g. "bring the invite flow
 * from Compani into this project"). It is invoked explicitly as a tool call,
 * never implicit global file access:
 *   - list_user_projects       — see what other projects exist to reference
 *   - list_reference_project_dir / read_reference_project_file — read-only browse+read
 * All reads are logged via ctx.writeStep(SOURCE_REFERENCED) for an audit trail.
 * Nothing here can write to the reference project, and nothing here writes to
 * the CURRENT project either — applying anything found still goes through the
 * normal edit_file / line_patch tools against ctx.workspaceDir, which keeps
 * the existing approve-before-apply flow intact.
 */

const EXCLUDED = new Set(["node_modules", ".git", "dist", ".next", ".cache", "coverage"]);
const MAX_LINES = 4000;

async function resolveReferenceProject(
  userId: number,
  currentProjectId: number,
  nameOrId: string,
): Promise<{ id: number; name: string } | null> {
  const asId = Number(nameOrId);
  const rows = await db
    .select({ id: projectsTable.id, name: projectsTable.name })
    .from(projectsTable)
    .where(and(eq(projectsTable.userId, userId), ne(projectsTable.id, currentProjectId)));

  if (!Number.isNaN(asId)) {
    const byId = rows.find((r) => r.id === asId);
    if (byId) return byId;
  }

  const needle = nameOrId.trim().toLowerCase();
  const exact = rows.find((r) => r.name.trim().toLowerCase() === needle);
  if (exact) return exact;

  const partial = rows.filter((r) => r.name.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];

  return null;
}

export function listUserProjectsTool(ctx: AgentToolContext) {
  return tool({
    description:
      "List the current user's OTHER projects (excluding this one), so you know what's available to reference or compare against. Use this before read_reference_project_file when the user mentions another project by name (e.g. 'like we did in Compani').",
    inputSchema: z.object({}),
    execute: async () => {
      const started = performance.now();
      ctx.emitToolCall("list_user_projects", {});
      try {
        const rows = await db
          .select({ id: projectsTable.id, name: projectsTable.name, description: projectsTable.description })
          .from(projectsTable)
          .where(and(eq(projectsTable.userId, ctx.userId), ne(projectsTable.id, ctx.projectId)))
          .orderBy(desc(projectsTable.lastOpenedAt))
          .limit(30);
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("list_user_projects", true, ms);
        return { projects: rows };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("list_user_projects", false, ms);
        return { error: String(err), projects: [] };
      }
    },
  });
}

export function listReferenceProjectDirTool(ctx: AgentToolContext) {
  return tool({
    description:
      "Read-only: list files/directories inside ANOTHER of the user's projects, identified by name or id (see list_user_projects). Use this to locate an implementation the user wants to compare or reuse. Never modifies the reference project.",
    inputSchema: z.object({
      project: z.string().describe("Name or id of the other project, e.g. \"Compani\""),
      path: z.string().default("."),
    }),
    execute: async ({ project, path: relPath }) => {
      const started = performance.now();
      ctx.emitToolCall("list_reference_project_dir", { project, path: relPath });
      try {
        const ref = await resolveReferenceProject(ctx.userId, ctx.projectId, project);
        if (!ref) {
          ctx.emitToolResult("list_reference_project_dir", false, Math.round(performance.now() - started));
          return { error: `No project matching "${project}" found among your other projects.`, children: [] };
        }
        const refDir = projectWorkspaceDir(ref.id);
        const abs = resolveWorkspacePath(refDir, relPath || ".");
        const entries = await readdir(abs);
        const children: Array<{ name: string; path: string; type: "file" | "dir" }> = [];
        for (const name of entries.sort()) {
          if (name.startsWith(".") || EXCLUDED.has(name)) continue;
          const childPath = path.join(abs, name);
          const rel = relPath && relPath !== "." ? `${relPath}/${name}` : name;
          try {
            const s = await stat(childPath);
            children.push({ name, path: rel, type: s.isDirectory() ? "dir" : "file" });
          } catch { /* skip */ }
        }
        ctx.writeStep({ verb: "SOURCE_REFERENCED", target: `${ref.name}:${relPath || "."}`, phase: "reference" });
        ctx.emitToolResult("list_reference_project_dir", true, Math.round(performance.now() - started));
        return { referenceProject: ref.name, children };
      } catch (err) {
        ctx.emitToolResult("list_reference_project_dir", false, Math.round(performance.now() - started));
        return { error: String(err), children: [] };
      }
    },
  });
}

export function readReferenceProjectFileTool(ctx: AgentToolContext) {
  return tool({
    description:
      "Read-only: read a file's contents from ANOTHER of the user's projects, identified by name or id. Use this to inspect an implementation (e.g. an invite flow) the user wants to compare or bring into the current project. This never writes to the reference project. To apply anything here to the CURRENT project, use edit_file / line_patch afterward — never assume the copy is automatic.",
    inputSchema: z.object({
      project: z.string().describe("Name or id of the other project, e.g. \"Compani\""),
      path: z.string().describe("Relative path to the file inside that project"),
    }),
    execute: async ({ project, path: relPath }) => {
      const started = performance.now();
      ctx.emitToolCall("read_reference_project_file", { project, path: relPath });
      try {
        const ref = await resolveReferenceProject(ctx.userId, ctx.projectId, project);
        if (!ref) {
          ctx.emitToolResult("read_reference_project_file", false, Math.round(performance.now() - started));
          return { error: `No project matching "${project}" found among your other projects.`, content: null };
        }
        const refDir = projectWorkspaceDir(ref.id);
        const abs = resolveWorkspacePath(refDir, relPath);
        const raw = await readFile(abs, "utf8");
        const lines = raw.split("\n");
        const truncated = lines.length > MAX_LINES;
        const content = truncated ? lines.slice(0, MAX_LINES).join("\n") : raw;
        ctx.writeStep({ verb: "SOURCE_REFERENCED", target: `${ref.name}:${relPath}`, phase: "reference" });
        ctx.emitToolResult("read_reference_project_file", true, Math.round(performance.now() - started));
        return { referenceProject: ref.name, content, truncated, lineCount: lines.length };
      } catch (err) {
        ctx.emitToolResult("read_reference_project_file", false, Math.round(performance.now() - started));
        return { error: String(err), content: null };
      }
    },
  });
}
