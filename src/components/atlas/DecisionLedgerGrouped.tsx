import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import type { Entry } from "@/lib/atlas-status";
import { relativeTime } from "@/lib/atlas";

/**
 * DecisionLedgerGrouped — the Ledger column from POSITIONING.md §6 / §8.
 *
 * Three groups, in this exact order:
 *   1. Committed       — locked decisions, no successor
 *   2. In Tension      — committed decisions that have an unresolved catch
 *                        against them (a chat surfaced a "Before you do —"
 *                        but no proceed/adjust resolution yet — currently
 *                        approximated as "has children but none committed
 *                        as deviations yet" — see note below).
 *   3. Overridden      — decisions that have been superseded by a later
 *                        deviation entry (relationship, not a state).
 *
 * Updates ONLY on Commit or Proceed Anyway — both of those write to entries,
 * which is what the parent page already polls/loads. We don't subscribe here.
 */

export interface DecisionLedgerGroupedProps {
  /** All committed-or-superseded entries for this user/project. */
  entries: Entry[];
  /** Optional id to highlight (e.g. ?focus= deep-link). */
  focusId?: string;
}

interface GroupedEntries {
  committed: Entry[];
  inTension: Entry[];
  overridden: Entry[];
}

function groupEntries(entries: Entry[]): GroupedEntries {
  // Map entry id → set of children that supersede it
  const childrenOf = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.supersedes_id) {
      const arr = childrenOf.get(e.supersedes_id) ?? [];
      arr.push(e);
      childrenOf.set(e.supersedes_id, arr);
    }
  }

  const committed: Entry[] = [];
  const inTension: Entry[] = [];
  const overridden: Entry[] = [];

  for (const e of entries) {
    if (e.status !== "committed") continue;
    const children = childrenOf.get(e.id) ?? [];
    const hasDeviation = children.some(
      (c) => c.deviation === true && c.status === "committed",
    );
    // A "catch_against_id" pointer on a CHILD without deviation=true would
    // mean an in-tension state — but right now any successor with
    // catch_against_id ALSO carries deviation=true (proceedAnyway sets both).
    // We keep In Tension reserved for the case where a catch fired and the
    // user neither proceeded nor adjusted (no successor written yet). That
    // state is detected at the message level, not here. So this view shows:
    //   • In Tension = this entry is the target of a catch_against pointer
    //                  on a child that is NOT yet committed.
    const hasUnresolvedChild = children.some(
      (c) => c.catch_against_id === e.id && c.status !== "committed",
    );

    if (hasDeviation) overridden.push(e);
    else if (hasUnresolvedChild) inTension.push(e);
    else committed.push(e);
  }

  return { committed, inTension, overridden };
}

export function DecisionLedgerGrouped({
  entries,
  focusId,
}: DecisionLedgerGroupedProps) {
  const groups = useMemo(() => groupEntries(entries), [entries]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Group
        label="Committed"
        accent="var(--phosphor)"
        entries={groups.committed}
        focusId={focusId}
        emptyHint="Nothing locked in yet."
      />
      <Group
        label="In Tension"
        accent="var(--ember)"
        entries={groups.inTension}
        focusId={focusId}
        emptyHint="No open tensions."
      />
      <Group
        label="Overridden"
        accent="var(--muted-text)"
        entries={groups.overridden}
        focusId={focusId}
        emptyHint="Nothing overridden."
      />
    </div>
  );
}

interface GroupProps {
  label: string;
  accent: string;
  entries: Entry[];
  focusId?: string;
  emptyHint: string;
}

function Group({ label, accent, entries, focusId, emptyHint }: GroupProps) {
  return (
    <section>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          padding: "0 2px",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: accent,
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase" as const,
            color: accent,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.06em",
            color: "var(--muted-text)",
            marginLeft: "auto",
          }}
        >
          {entries.length}
        </span>
      </div>

      {entries.length === 0 ? (
        <div
          style={{
            fontSize: 12,
            fontStyle: "italic" as const,
            color: "var(--muted-text)",
            padding: "6px 2px",
          }}
        >
          {emptyHint}
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {entries.map((e) => (
            <li key={e.id}>
              <Link
                to="/ledger"
                search={{ focus: e.id }}
                data-entry-id={e.id}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 6,
                  textDecoration: "none",
                  background: focusId === e.id ? "var(--surface-alt)" : "transparent",
                  border: focusId === e.id ? `1px solid ${accent}` : "1px solid transparent",
                  transition: "all 140ms ease",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--foreground)",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap" as const,
                    letterSpacing: "-0.005em",
                  }}
                >
                  {e.title}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9.5,
                    letterSpacing: "0.06em",
                    color: "var(--muted-text)",
                    flexShrink: 0,
                  }}
                >
                  {relativeTime(e.created_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
