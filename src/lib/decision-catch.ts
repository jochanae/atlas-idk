/**
 * Decision Catch — client-side helpers.
 *
 * The brain of the catch lives server-side (atlas-chat + decision-catch.ts).
 * This file holds the shared types and the two transitions a catch can take:
 *   • proceedAnyway — log a deviation entry referencing the original.
 *   • adjust        — no DB write here; UI follows up with a CommitPrompt.
 *
 * Per POSITIONING.md §3.4, "Proceed anyway" is itself a committed decision
 * (an intentional tradeoff). It writes a NEW entry with deviation=true and
 * catch_against_id pointing at the original committed entry. The original
 * remains immutable.
 */

import { supabase } from "@/integrations/supabase/client";
import { entriesTable } from "@/lib/entries";
import type { Entry } from "@/lib/atlas-status";

export interface DecisionCatchPayload {
  v: 1;
  against: { id: string; title: string };
  leadSentence: string;
}

/** Type guard for the JSONB column. */
export function isDecisionCatch(value: unknown): value is DecisionCatchPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.v !== 1) return false;
  if (!v.against || typeof v.against !== "object") return false;
  const a = v.against as Record<string, unknown>;
  return typeof a.id === "string" && typeof a.title === "string";
}

interface ProceedArgs {
  userId: string;
  projectId: string;
  sessionId: string | null;
  sourceMessageId: string;
  catchPayload: DecisionCatchPayload;
  /** Optional one-line "why" the user proceeded. */
  reason?: string;
}

/**
 * Proceed anyway. Logs a deviation entry that:
 *   • supersedes the original (relationship: Overridden)
 *   • carries deviation=true and the named tension as deviation_reason
 *   • lands as committed (the user just made a conscious tradeoff)
 *
 * Future Decision Catches can reference this deviation as its own decision.
 */
export async function proceedAnyway(args: ProceedArgs): Promise<Entry> {
  const { userId, projectId, sessionId, sourceMessageId, catchPayload, reason } = args;
  const row: Record<string, unknown> = {
    user_id: userId,
    project_id: projectId,
    session_id: sessionId,
    status: "committed",
    severity: "neutral",
    verb: "merge",
    title: `Proceeded against: ${catchPayload.against.title}`,
    summary: reason?.trim()
      ? reason.trim()
      : "Intentional tradeoff — Atlas flagged a tension; user chose to proceed.",
    details: catchPayload.leadSentence,
    source_message_id: sourceMessageId,
    supersedes_id: catchPayload.against.id,
    catch_against_id: catchPayload.against.id,
    deviation: true,
    deviation_reason: reason?.trim() || catchPayload.leadSentence,
    is_violation: false,
    card_schema_version: 1,
  };
  const { data, error } = await entriesTable()
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Proceed-anyway returned no row.");

  // Lock the originating chat message so it can't be silently revised.
  await supabase
    .from("chat_messages")
    .update({ committed_card_id: data.id })
    .eq("id", sourceMessageId);

  return data;
}
