/**
 * Slice 2 — Outputs classification (pure, table-driven).
 *
 * NOT WIRED YET. This module classifies a raw output/artifact row into a
 * canonical `kind`, human-readable `tags`, and inclusion flags for the
 * All Outputs and Artifacts galleries. Slice 3 will consume it; today it
 * exists only so we can prove the taxonomy against real data via tests.
 *
 * Input domain (from production inventory, 2026-07-16, 242 rows):
 *
 *   source          | type              | extension | count | notes
 *   ----------------|-------------------|-----------|-------|------
 *   null            | history_snapshot  | null      | 226   | pre-artifact-engine
 *   artifact-engine | pptx              | pptx      | 7     |
 *   null            | visual_sketch     | null      | 3     | pre-artifact-engine
 *   artifact-engine | draft_email       | md        | 2     | type discriminates from draft_pr
 *   artifact-engine | draft_pr          | md        | 1     | type discriminates from draft_email
 *   artifact-engine | mermaid           | mmd       | 1     |
 *   artifact-engine | pdf               | pdf       | 1     |
 *   artifact-engine | xlsx              | xlsx      | 1     |
 *
 * Not in production yet, expected post-deploy — rules included so the table
 * is exhaustive on the day the deploy lands:
 *
 *   artifact-engine | html-app          | html      | dev only (Axiom Activity Ledger)
 *   artifact-engine | html_preview      | html      | dev alias
 *   artifact-engine | docx              | docx      | dev only (IntoIQ)
 *
 * Rules are strictly matched against (source, type, extension). No content
 * or title string sniffing. If a row does not match any rule it falls to
 * `other` and is excluded from Artifacts by default so unknown data never
 * surfaces in a technical surface it wasn't designed for.
 */

export type OutputKind =
  | "html-app"
  | "react-component"
  | "project-app"
  | "deployed-app"
  | "mobile-mockup"
  | "document"
  | "presentation"
  | "spreadsheet"
  | "pdf"
  | "image"
  | "diagram"
  | "snapshot"
  | "sketch"
  | "other";

export interface ClassifyInput {
  source?: string | null;
  type?: string | null;
  extension?: string | null;
  // Optional metadata bag; today only `extension` is consulted, but callers
  // often have the whole `metadata` object handy. If `extension` is empty
  // we fall back to `metadata.extension`.
  metadata?: { extension?: string | null; [k: string]: unknown } | null;
}

export interface Classification {
  kind: OutputKind;
  tags: string[];
  includedInOutputs: boolean;
  includedInArtifacts: boolean;
  /** Which rule matched, for debugging and Slice-3 wiring verification. */
  reason: string;
}

interface Rule {
  id: string;
  source?: string | null | "*";
  type: string;
  extension?: string | null | "*";
  result: Omit<Classification, "reason">;
}

const norm = (v: string | null | undefined): string =>
  (v ?? "").trim().toLowerCase();

/**
 * Rule table — ordered. First match wins. `*` means "any value including
 * null". Explicit null means "must be null/empty".
 */
const RULES: Rule[] = [
  // ── Pre-artifact-engine rows (source is null) ─────────────────────────
  {
    id: "history_snapshot",
    source: null,
    type: "history_snapshot",
    extension: null,
    result: {
      kind: "snapshot",
      tags: ["Snapshot"],
      // 226/242 rows — bulk of the table. Per plan.md classification
      // cleanup: timeline-only, not an Output.
      includedInOutputs: false,
      includedInArtifacts: false,
    },
  },
  {
    id: "visual_sketch",
    source: null,
    type: "visual_sketch",
    extension: null,
    result: {
      kind: "sketch",
      tags: ["Sketch"],
      includedInOutputs: true,
      includedInArtifacts: false,
    },
  },

  // ── Artifact-engine rows ──────────────────────────────────────────────
  {
    id: "html-app",
    source: "artifact-engine",
    type: "html-app",
    extension: "html",
    result: {
      kind: "html-app",
      tags: ["Prototype · Interactive"],
      includedInOutputs: true,
      includedInArtifacts: true,
    },
  },
  {
    id: "html_preview_alias",
    source: "artifact-engine",
    type: "html_preview",
    extension: "html",
    result: {
      kind: "html-app",
      tags: ["Prototype · Interactive"],
      includedInOutputs: true,
      includedInArtifacts: true,
    },
  },
  {
    id: "pptx",
    source: "artifact-engine",
    type: "pptx",
    extension: "pptx",
    result: {
      kind: "presentation",
      tags: ["Presentation"],
      includedInOutputs: true,
      includedInArtifacts: false,
    },
  },
  {
    id: "xlsx",
    source: "artifact-engine",
    type: "xlsx",
    extension: "xlsx",
    result: {
      kind: "spreadsheet",
      tags: ["Spreadsheet"],
      includedInOutputs: true,
      includedInArtifacts: false,
    },
  },
  {
    id: "pdf",
    source: "artifact-engine",
    type: "pdf",
    extension: "pdf",
    result: {
      kind: "pdf",
      tags: ["PDF"],
      includedInOutputs: true,
      includedInArtifacts: false,
    },
  },
  {
    id: "docx",
    source: "artifact-engine",
    type: "docx",
    extension: "docx",
    result: {
      kind: "document",
      tags: ["Document"],
      includedInOutputs: true,
      includedInArtifacts: false,
    },
  },
  {
    id: "mermaid",
    source: "artifact-engine",
    type: "mermaid",
    extension: "mmd",
    result: {
      kind: "diagram",
      tags: ["Diagram · Mermaid"],
      includedInOutputs: true,
      includedInArtifacts: false,
    },
  },
  // draft_email and draft_pr both have extension="md" — type discriminates.
  {
    id: "draft_email",
    source: "artifact-engine",
    type: "draft_email",
    extension: "md",
    result: {
      kind: "document",
      tags: ["Document · Email draft"],
      includedInOutputs: true,
      includedInArtifacts: false,
    },
  },
  {
    id: "draft_pr",
    source: "artifact-engine",
    type: "draft_pr",
    extension: "md",
    result: {
      kind: "document",
      tags: ["Document · PR description"],
      includedInOutputs: true,
      includedInArtifacts: false,
    },
  },
];

function matches(rule: Rule, src: string, type: string, ext: string): boolean {
  const srcOk =
    rule.source === "*"
      ? true
      : rule.source === null
        ? src === ""
        : norm(rule.source) === src;
  if (!srcOk) return false;
  if (norm(rule.type) !== type) return false;
  const extOk =
    rule.extension === "*"
      ? true
      : rule.extension === null || rule.extension === undefined
        ? ext === ""
        : norm(rule.extension) === ext;
  return extOk;
}

export function classify(input: ClassifyInput): Classification {
  const src = norm(input.source);
  const type = norm(input.type);
  const ext = norm(input.extension ?? input.metadata?.extension ?? null);

  for (const rule of RULES) {
    if (matches(rule, src, type, ext)) {
      return { ...rule.result, reason: `rule:${rule.id}` };
    }
  }

  return {
    kind: "other",
    tags: ["Other"],
    includedInOutputs: false,
    includedInArtifacts: false,
    reason: `unmatched:source=${src || "∅"};type=${type || "∅"};ext=${ext || "∅"}`,
  };
}

/** Exposed for tests + Slice-3 debugging. */
export const __RULES__ = RULES;
