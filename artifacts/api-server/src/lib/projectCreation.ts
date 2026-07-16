import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";

type AuthUserForProjectCreation = {
  subscriptionTier?: string | null;
  role?: string | null;
};

type CreateProjectForUserInput = {
  userId: number;
  authUser?: AuthUserForProjectCreation | null;
  name: string;
  description?: string | null;
  entityType?: "project" | "idea";
  memory?: string | null;
  status?: "shaping" | "committed" | "built" | "archived";
};

export class ProjectLimitReachedError extends Error {
  readonly code = "PROJECT_LIMIT_REACHED";
  readonly status = 402;

  constructor() {
    super("Free plan is limited to 1 project.");
  }
}

let projectSchemaReady = false;

export async function ensureProjectSchema(): Promise<void> {
  if (projectSchemaReady) return;
  await db.execute(sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "entity_type" text DEFAULT 'project' NOT NULL`);
  await db.execute(sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "last_opened_at" timestamp with time zone DEFAULT now() NOT NULL`);
  await db.execute(sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "shape" JSONB NOT NULL DEFAULT '{"identity":[],"constraints":[],"formats":[]}'::jsonb`);
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE "projects" ADD CONSTRAINT "projects_entity_type_check" CHECK ("entity_type" IN ('project', 'idea'));
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$
  `);
  projectSchemaReady = true;
}

export async function createProjectForUser(input: CreateProjectForUserInput) {
  await ensureProjectSchema();

  // Free-tier 1-project cap removed 2026-07-16 — no per-tier project limit today.
  // ProjectLimitReachedError is retained as an export for legacy callers but is no longer thrown here.

  const [createdProject] = await db
    .insert(projectsTable)
    .values({
      name: input.name,
      description: input.description ?? null,
      entityType: input.entityType ?? "project",
      userId: input.userId,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.memory !== undefined ? { memory: input.memory } : {}),
    })
    .returning();

  let project = createdProject;

  // Auto-propagate GitHub token from any existing project of this user.
  if (!project.githubToken) {
    const [sibling] = await db
      .select({ githubToken: projectsTable.githubToken })
      .from(projectsTable)
      .where(and(eq(projectsTable.userId, input.userId), isNotNull(projectsTable.githubToken)))
      .limit(1);
    if (sibling?.githubToken) {
      const [updatedProject] = await db
        .update(projectsTable)
        .set({ githubToken: sibling.githubToken })
        .where(eq(projectsTable.id, project.id))
        .returning();
      project = updatedProject ?? { ...project, githubToken: sibling.githubToken };
    }
  }

  return project;
}
