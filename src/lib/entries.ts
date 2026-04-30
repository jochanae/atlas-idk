/**
 * Entries API — single source of truth for both Ledger and Parking Lot.
 *
 * Architectural rule (locked by user, 2026-04-30):
 *   "Ledger and Parking Lot are the same object, rendered differently
 *    based on state. Moving between them is NOT duplication. It is a
 *    status change on the same object."
 *
 * Therefore every transition here is a single UPDATE on the same row,
 * never an INSERT into a different table. The one exception is
 * `reopenEntry`, which inserts a NEW draft entry that references the
 * locked original via `supersedes_id`. The original stays immutable.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  Entry,
  EntryStatus,
  CommitCardPayload,
} from "@/lib/atlas-status";

// `entries` is not yet in generated types.ts. Use a typed escape hatch
// so the rest of the codebase remains strict.
type EntriesTable = {
  select: (columns?: string) => EntriesTable;
  insert: (
    values: Record<string, unknown> | Record<string, unknown>[],
  ) => EntriesTable;
  update: (values: Record<string, unknown>) => EntriesTable;
  delete: () => EntriesTable;
  eq: (column: string, value: unknown) => EntriesTable;
  in: (column: string, values: unknown[]) => EntriesTable;
  order: (column: string, options?: { ascending?: boolean }) => EntriesTable;
  limit: (n: number) => EntriesTable;
  single: () => Promise<{ data: Entry | null; error: Error | null }>;
  maybeSingle: () => Promise<{ data: Entry | null; error: Error | null }>;
  then: <T = { data: Entry[] | null; error: Error | null }>(
    onfulfilled?: (
      v: { data: Entry[] | null; error: Error | null },
    ) => T | PromiseLike<T>,
  ) => Promise<T>;
};

export function entriesTable(): EntriesTable {
  return (
    supabase as unknown as { from: (table: "entries") => EntriesTable }
  ).from("entries");
}

// ──────────────────────────────────────────────────────────────────────
// Reads
// ──────────────────────────────────────────────────────────────────────

export async function listEntries(opts: {
  userId: string;
  status?: EntryStatus | EntryStatus[];
  projectId?: string;
}): Promise<Entry[]> {
  let q = entriesTable().select("*").eq("user_id", opts.userId);
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  if (Array.isArray(opts.status)) q = q.in("status", opts.status);
  else if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ──────────────────────────────────────────────────────────────────────
// Creators (from a CommitCard payload in chat)
// ──────────────────────────────────────────────────────────────────────

interface CreateFromCardArgs {
  userId: string;
  projectId: string;
  sessionId: string | null;
  sourceMessageId: string;
  payload: CommitCardPayload;
  status: Extract<EntryStatus, "committed" | "parked">;
  /** Atlas mode that produced this entry (think/plan/build/explore/decide/audit). */
  mode?: string | null;
}

/**
 * Create an Entry from a chat CommitCard. Status is the only knob:
 * - status='committed' → goes to Ledger, locked_at auto-stamped by trigger
 * - status='parked'    → goes to Parking Lot, mutable
 */
export async function createEntryFromCard(
  args: CreateFromCardArgs,
): Promise<Entry> {
  const { userId, projectId, sessionId, sourceMessageId, payload, status } =
    args;
  const row: Record<string, unknown> = {
    user_id: userId,
    project_id: projectId,
    session_id: sessionId,
    status,
    title: payload.title,
    summary: payload.summary,
    details: payload.details ?? null,
    severity: payload.severity,
    verb: payload.verb ?? null,
    build_id: payload.build_id ?? null,
    touched: payload.touched ?? null,
    source_message_id: sourceMessageId,
    card_schema_version: payload.v,
    is_violation: payload.severity === "blocker",
  };
  const { data, error } = await entriesTable()
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Entry creation returned no row.");

  // Lock the originating chat turn so it can't silently be revised.
  await supabase
    .from("chat_messages")
    .update({ committed_card_id: data.id })
    .eq("id", sourceMessageId);

  return data;
}

// ──────────────────────────────────────────────────────────────────────
// Transitions — these are the only ways state changes
// ──────────────────────────────────────────────────────────────────────

/** Park → Commit. Status flip on the same row. Trigger stamps locked_at. */
export async function commitEntry(entryId: string): Promise<Entry> {
  const { data, error } = await entriesTable()
    .update({ status: "committed", severity: "committed" })
    .eq("id", entryId)
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Commit returned no row.");
  return data;
}

/** Drop a draft/parked entry back to active session work. */
export async function resumeEntry(entryId: string): Promise<Entry> {
  // "Resume" semantically means: take this back into the session it came
  // from. We don't change the status here (it's already parked). The UI
  // navigates the user back to the source session; this function is a
  // hook for any future state we want to set (e.g. last_resumed_at).
  const { data, error } = await entriesTable()
    .select("*")
    .eq("id", entryId)
    .single();
  if (error) throw error;
  if (!data) throw new Error("Entry not found.");
  return data;
}

/** Delete a parked or draft entry. Locked entries cannot be deleted via UI. */
export async function deleteEntry(entryId: string): Promise<void> {
  const { error } = await entriesTable().delete().eq("id", entryId);
  if (error) throw error;
}

/**
 * Reopen a committed (locked) entry. Per the locked spec:
 *   "Reopen creates a new draft entry, original stays locked."
 * We INSERT a new row with status='draft', supersedes_id pointing at the
 * original. The original is never mutated.
 */
export async function reopenEntry(original: Entry): Promise<Entry> {
  const row: Record<string, unknown> = {
    user_id: original.user_id,
    project_id: original.project_id,
    session_id: original.session_id,
    status: "draft" as EntryStatus,
    title: original.title,
    summary: original.summary,
    details: original.details,
    severity: "neutral",
    verb: original.verb,
    build_id: original.build_id,
    touched: original.touched,
    source_message_id: original.source_message_id,
    card_schema_version: original.card_schema_version,
    supersedes_id: original.id,
  };
  const { data, error } = await entriesTable()
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Reopen returned no row.");
  return data;
}

/** Archive (soft-hide) — works on locked or unlocked entries. */
export async function archiveEntry(entryId: string): Promise<Entry> {
  const { data, error } = await entriesTable()
    .update({ status: "archived" })
    .eq("id", entryId)
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Archive returned no row.");
  return data;
}
