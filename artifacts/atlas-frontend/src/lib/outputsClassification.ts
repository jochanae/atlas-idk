/**
 * Slice 2 — Outputs classification (pure, table-driven).
 *
 * NOT WIRED YET. Slice 3 consumes this in the galleries.
 *
 * ── Input domain ─────────────────────────────────────────────────────
 *
 * Production inventory (2026-07-16, 242 rows):
 *
 *   source          | type              | extension | count
 *   ----------------|-------------------|-----------|------
 *   null            | history_snapshot  | null      | 226
 *   artifact-engine | pptx              | pptx      | 7
 *   null            | visual_sketch     | null      | 3
 *   artifact-engine | draft_email       | md        | 2
 *   artifact-engine | draft_pr          | md        | 1
 *   artifact-engine | mermaid           | mmd       | 1
 *   artifact-engine | pdf               | pdf       | 1
 *   artifact-engine | xlsx              | xlsx      | 1
 *
 * Dev-only (will hit production after next deploy) — cross-referenced
 * against backend types in artifacts/api-server/src/lib/library.ts and
 * artifacts/api-server/src/index.ts:1329, which whitelist:
 *   'html-app', 'html', 'html_preview', 'mermaid', 'chart'
 *
 *   artifact-engine | html-app          | html      | Axiom Activity Ledger
 *   artifact-engine | html_preview      | html      | alias
 *   artifact-engine | html              | html      | raw HTML renderer (htmlRenderer.ts)
 *   artifact-engine | docx              | docx      | IntoIQ items
 *   artifact-engine | chart             | *         | chart renderer (post-deploy)
 *
 * ── Source-column caveat ─────────────────────────────────────────────
 *
 * The frontend ArtifactRecord does not carry the DB `source` column
 * (it repurposes the field name for "project" | "legacy" routing).
 * Therefore the artifact-engine family uses source="*" — type and
 * extension are unique enough to discriminate safely. The two
 * pre-artifact-engine types (history_snapshot, visual_sketch) keep
 * strict null-source matching because their type names could in
 * theory collide with future artifact-engine variants.
 *
 * No content/title string sniffing. Unknown rows → `other`, excluded
 * from both surfaces, with a traceable `reason`.
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
  | "chart"
  | "snapshot"
  | "sketch"
  | "other";

export interface ClassifyInput {
  source?: string | null;
  type?: string | null;
  extension?: string | null;
  metadata?: { extension?: string | null; [k: string]: unknown } | null;
}

export interface Classification {
  kind: OutputKind;
  tags: string[];
  includedInOutputs: boolean;
  includedInArtifacts: boolean;
  reason: string;
}

interface Rule {
  id: string;
  /** `"*"` = any (including null). Explicit null = must be null/empty. */
  source: string | null | "*";
  type: string;
  extension: string | null | "*";
  result: Omit<Classification, "reason">;
}

const norm = (v: string | null | undefined): string =>
  (v ?? "").trim().toLowerCase();

const RULES: Rule[] = [
  // ── Pre-artifact-engine rows (strict null source) ─────────────────────
  {
    id: "history_snapshot",
    source: null,
    type: "history_snapshot",
    extension: null,
    result: {
      kind: "snapshot",
      tags: ["Snapshot"],
      // 226/242 rows — timeline-only per plan.md.
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
      tags: ["Visual sketch"],
      // Amended 2026-07-16: generated visual artifact — belongs in both.
      includedInOutputs: true,
      includedInArtifacts: true,
    },
  },

  // ── Artifact-engine family (source wildcard; type+ext discriminate) ──
  {
    id: "html-app",
    source: "*",
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
    source: "*",
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
    // Amended 2026-07-16: raw type="html" (backend htmlRenderer emits this)
    // classifies as html-app so Slice-4 Draft deep-link works uniformly.
    id: "html_raw",
    source: "*",
    type: "html",
    extension: "html",
    result: {
      kind: "html-app",
      tags: ["Prototype · Interactive"],
      includedInOutputs: true,
      includedInArtifacts: true,
    },
  },
  {
    id: "mermaid",
    source: "*",
    type: "mermaid",
    extension: "mmd",
    result: {
      kind: "diagram",
      tags: ["Diagram · Mermaid"],
      // Amended 2026-07-16: renderable technical diagram — belongs in both.
      includedInOutputs: true,
      includedInArtifacts: true,
    },
  },
  {
    id: "chart",
    source: "*",
    type: "chart",
    extension: "*",
    result: {
      kind: "chart",
      tags: ["Chart"],
      includedInOutputs: true,
      includedInArtifacts: true,
    },
  },
  {
    id: "pptx",
    source: "*",
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
    source: "*",
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
    source: "*",
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
    source: "*",
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
    id: "draft_email",
    source: "*",
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
    source: "*",
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
      : rule.extension === null
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

export const __RULES__ = RULES;
