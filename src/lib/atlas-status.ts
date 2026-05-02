/**
 * Atlas status vocabulary — single source of truth for the
 * RAG severities, builder verbs, and CommitCard payload schema.
 *
 * The renderer MUST branch on `card_schema_version` to ensure backward
 * compatibility as the CommitCard evolves. v1 is the inaugural shape.
 */

import type { Severity, Verb } from "@/components/atlas/StatusGlyph";

export type { Severity, Verb };

export const SEVERITIES: Severity[] = ["blocker", "parked", "committed", "neutral"];
export const VERBS: Verb[] = ["new", "bug", "perf", "note", "wip", "audit", "merge", "plan"];

export const CARD_SCHEMA_CURRENT = 1 as const;

/**
 * Entry lifecycle status. The single discriminator that decides which
 * "lens" (Ledger / Parking Lot) renders an entry. Same object, two states.
 */
export type EntryStatus = "committed" | "parked" | "draft" | "archived";

/**
 * The unified Entry type. Mirrors the public.entries table.
 * Ledger view = filter status='committed'. Parking Lot = filter status='parked'.
 */
export interface Entry {
  id: string;
  user_id: string;
  project_id: string;
  session_id: string | null;
  status: EntryStatus;
  title: string;
  summary: string | null;
  details: string | null;
  severity: Severity;
  verb: Verb | null;
  build_id: string | null;
  touched: string[] | null;
  source_message_id: string | null;
  card_schema_version: number;
  is_violation: boolean;
  cost_of_lesson: number | null;
  supersedes_id: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
  /** Atlas mode that produced this entry (think/plan/build/explore/decide/audit). */
  mode: string | null;
  /** Decision Catch: true when this entry was created via "Proceed anyway". */
  deviation?: boolean;
  /** Why the user proceeded against the prior decision. */
  deviation_reason?: string | null;
  /** The committed entry this deviation pushed against. */
  catch_against_id?: string | null;
}

/**
 * v1 CommitCard payload. The AI emits this as a JSON block when it has
 * something committable. Anything else stays as plain prose.
 */
export interface CommitCardPayloadV1 {
  /** Schema version — renderer branches on this. */
  v: 1;
  /** Severity for the RAG status indicator. */
  severity: Severity;
  /** Builder verb for the glyph. Optional — falls back to severity-only dot. */
  verb?: Verb | null;
  /** Short title — the headline of the delivery. */
  title: string;
  /** 1–2 line summary, plain text. */
  summary: string;
  /** Long-form details — markdown allowed. Shown when "Details" is expanded. */
  details?: string;
  /** Short build identifier, e.g. "BUILD-782". Rendered as #BUILD-782. */
  build_id?: string;
  /** Optional artifact id to open in the existing ArtifactDrawer on Preview. */
  preview_artifact_id?: string;
  /** Optional list of files/areas touched, shown in the details drawer. */
  touched?: string[];
}

export type CommitCardPayload = CommitCardPayloadV1;

/**
 * Detect a CommitCard JSON block in an AI message body.
 *
 * Convention: the AI wraps the JSON in a fenced ```atlas-card``` block.
 * Anything outside the fence stays as plain prose.
 */
const FENCE_RE = /```atlas-card\s*([\s\S]*?)```/;

export interface ParsedAtlasMessage {
  prose: string;
  card: CommitCardPayload | null;
  schemaVersion: number | null;
}

export function parseAtlasMessage(content: string): ParsedAtlasMessage {
  const match = content.match(FENCE_RE);
  if (!match) return { prose: content, card: null, schemaVersion: null };

  try {
    const raw = JSON.parse(match[1]) as Partial<CommitCardPayload> & { v?: number };
    const version = typeof raw.v === "number" ? raw.v : null;

    // v1 validation
    if (version === 1 && raw.severity && raw.title && raw.summary) {
      const card: CommitCardPayloadV1 = {
        v: 1,
        severity: raw.severity,
        verb: raw.verb ?? null,
        title: raw.title,
        summary: raw.summary,
        details: raw.details,
        build_id: raw.build_id,
        preview_artifact_id: raw.preview_artifact_id,
        touched: raw.touched,
      };
      const prose = (content.slice(0, match.index!) + content.slice(match.index! + match[0].length)).trim();
      return { prose, card, schemaVersion: 1 };
    }

    // Future versions: add cases here. Unknown versions degrade to prose-only.
    return { prose: content, card: null, schemaVersion: version };
  } catch {
    return { prose: content, card: null, schemaVersion: null };
  }
}

/**
 * Generate a short build_id like "BUILD-A4F2" from a uuid.
 * Stable per id — used when the AI doesn't supply one.
 */
export function deriveBuildId(seed: string): string {
  const hex = seed.replace(/-/g, "").slice(0, 4).toUpperCase();
  return `BUILD-${hex}`;
}
