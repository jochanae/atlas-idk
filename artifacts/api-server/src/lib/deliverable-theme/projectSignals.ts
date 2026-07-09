// Loads the DNA signals a theme can be inferred from, for a given project.
// Kept separate from inferTheme.ts (pure LLM logic) and tokens.ts (pure
// token shape) so each file has one job.
import { db, projectDnaTable, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { ThemeResolutionInput } from "./tokens";

export async function loadProjectThemeSignals(
  projectId: number,
  styleOverride?: string,
): Promise<ThemeResolutionInput> {
  const [dnaRow] = await db
    .select()
    .from(projectDnaTable)
    .where(eq(projectDnaTable.projectId, projectId))
    .limit(1);
  const [projectRow] = await db
    .select({ name: projectsTable.name })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);

  const experienceIntent = (dnaRow?.experienceIntent as Record<string, unknown>) ?? {};

  return {
    creativePrinciples: (dnaRow?.creativePrinciples as string[] | undefined) ?? [],
    experienceIntent: {
      emotionalRegister: experienceIntent.emotionalRegister as string[] | undefined,
      visualLanguage: experienceIntent.visualLanguage as string[] | undefined,
      designPrinciples: experienceIntent.designPrinciples as string[] | undefined,
      interactionPosture: experienceIntent.interactionPosture as string[] | undefined,
    },
    styleOverride,
    projectName: projectRow?.name,
  };
}
