/**
 * Milestone 2.2 — Ask Atlas → Workspace intelligence seed.
 *
 * Handoff historically preserved transcript + Resume only. Workspace surfaces
 * (Insights DNA, Objects, Blueprint) stayed empty until later extractors ran —
 * and Nexus Workspace often never triggered them.
 *
 * Call this after conversation messages are linked to a project.
 */

import { db, projectTier1MemoryTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { getOrCreateProjectDNA, getProjectDNA, updateProjectDNA } from "./projectDNA";
import { runGenomeExtraction } from "./genomeExtract";
import { flushNexusTier1BufferToProject } from "../services/tier1";

/** Map flushed Tier1 fields into Project DNA so Insights aren't empty while Haiku runs. */
export async function seedDnaFromTier1(projectId: number): Promise<void> {
  const [tier1] = await db
    .select()
    .from(projectTier1MemoryTable)
    .where(eq(projectTier1MemoryTable.projectId, projectId))
    .limit(1);
  if (!tier1) return;

  await getOrCreateProjectDNA(projectId);
  const existing = await getProjectDNA(projectId);

  const constraints = [
    ...(existing?.constraints ?? []),
    ...(tier1.outOfScope?.trim() ? [`Out of scope: ${tier1.outOfScope.trim()}`] : []),
    ...(tier1.constraints?.trim() ? [tier1.constraints.trim()] : []),
  ].filter(Boolean);

  // Dedupe constraints
  const uniqueConstraints = [...new Set(constraints.map((c) => c.trim()).filter(Boolean))].slice(0, 8);

  const patch: Parameters<typeof updateProjectDNA>[1] = {};
  if (!existing?.purpose?.trim() && tier1.building?.trim()) {
    patch.purpose = tier1.building.trim();
  }
  if (!existing?.audience?.trim() && tier1.audience?.trim()) {
    patch.audience = tier1.audience.trim();
  }
  if (!existing?.wedge?.trim() && tier1.problem?.trim()) {
    patch.wedge = tier1.problem.trim();
  }
  if (uniqueConstraints.length > 0 && (existing?.constraints?.length ?? 0) === 0) {
    patch.constraints = uniqueConstraints;
  }
  if (tier1.successSignal?.trim() && !(existing?.openQuestions?.length)) {
    // Keep success as a guiding open question until genome synthesizes better
    patch.openQuestions = [`Success signal: ${tier1.successSignal.trim()}`];
  }

  // Lift stage past Think when we have real purpose + audience
  if ((patch.purpose || existing?.purpose) && (patch.audience || existing?.audience)) {
    if (!existing?.stage || existing.stage === "Think") {
      patch.stage = "Shape";
    }
  }

  const filled =
    (patch.purpose ? 1 : 0) +
    (patch.audience ? 1 : 0) +
    (patch.wedge ? 1 : 0) +
    (patch.constraints ? 1 : 0);
  if (filled > 0 && (existing?.confidenceScore ?? 0) < 35) {
    patch.confidenceScore = Math.min(55, 15 + filled * 10);
  }

  if (Object.keys(patch).length === 0) return;
  patch.lastEvolvedAt = new Date();
  await updateProjectDNA(projectId, patch);
  logger.info({ projectId, fields: Object.keys(patch) }, "handoff: seeded DNA from Tier1");
}

/**
 * After Ask Atlas conversation is linked to a project:
 * 1. Flush Tier1 buffer → project_tier1_memory
 * 2. Project Tier1 → DNA (fast Insights fill)
 * 3. Run genome extraction (objects + richer DNA) fire-and-forget
 */
export async function seedIntelligenceAfterHandoff(opts: {
  projectId: number;
  userId: number;
  /** Ask Atlas conversation id (source of Tier1 buffer + original messages). */
  sourceConversationId?: string | null;
}): Promise<void> {
  const { projectId, userId, sourceConversationId } = opts;

  try {
    if (sourceConversationId) {
      await flushNexusTier1BufferToProject(sourceConversationId, projectId, userId);
    }
  } catch (err) {
    logger.warn({ err, projectId, sourceConversationId }, "handoff: Tier1 flush failed — non-fatal");
  }

  try {
    await seedDnaFromTier1(projectId);
  } catch (err) {
    logger.warn({ err, projectId }, "handoff: DNA seed from Tier1 failed — non-fatal");
  }

  // Force genome extraction (bypass maybeExtractGenome CHAT/cooldown gates)
  void runGenomeExtraction(projectId)
    .then(() => {
      logger.info({ projectId }, "handoff: genome extraction complete");
    })
    .catch((err) => {
      logger.warn({ err, projectId }, "handoff: genome extraction failed — non-fatal");
    });
}
