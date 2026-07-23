/**
 * DecisionCatchCard payload — produced by the backend "decision catch"
 * detection layer when a user's BUILD intent (or a strong forward-looking
 * decision from Joy) semantically overlaps with an already-committed
 * Decision Ledger entry.
 *
 * See: docs/handoffs/2026-07-07-decision-catch-endpoint.md
 *
 * The MVP spine (mem://features/positioning) requires three checks:
 *   - Alignment  → this reinforces a committed decision
 *   - Conflict   → this pulls against a committed decision
 *   - Pattern    → this rhymes with a prior override / deviation
 *
 * The card presents the checks, then two actions:
 *   - Proceed anyway → writes a new "deviation" ledger entry (status=committed,
 *                      catchAgainstId=<conflictingEntryId>, deviationReason)
 *   - Adjust         → dismisses the card, no persistence
 */

export type CatchCheckKind = "alignment" | "conflict" | "pattern";

export type CatchCheck = {
  kind: CatchCheckKind;
  /** Ledger entry this check references (required for conflict/alignment). */
  entryId?: number;
  entryTitle?: string;
  /** One-line explanation shown in the card. */
  note: string;
};

export type CatchPayload = {
  v: 1;
  /** What Joy heard the user (or itself) commit to. */
  intent: string;
  /** Ordered checks — conflicts should come first. */
  checks: CatchCheck[];
  /** Primary ledger entry to log the deviation against when Proceed anyway is used. */
  primaryConflictEntryId?: number;
  /** Suggested title for the deviation entry if the user proceeds. */
  deviationTitle?: string;
};
