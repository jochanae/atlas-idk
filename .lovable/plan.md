
# Outputs is parent, Artifacts is inner view — revised, sliced

## Product structure (locked)

Three surfaces, three jobs:
- **Outputs**: browse what Atlas produced.
- **Artifacts**: inspect the interactive/technical subset, including revisions.
- **Preview**: run or view the selected item.

Inside the existing top-level `Outputs` tab:

```text
OUTPUTS
[ All Outputs ] [ Artifacts ]

Search this project…
```

`All Outputs` is default and includes every user-facing result.

## Component architecture

```text
OutputsPanel.tsx              parent, owns inner-tab state
├── OutputsGallery.tsx        ordinary deliverables
└── ArtifactsGallery.tsx      technical/interactable subset

artifactPresentationMap.ts    canonical kind → surface map
outputsClassification.ts      pure row → { kind, tags, includedInOutputs, includedInArtifacts }
```

If current `ArtifactsPanel.tsx` already renders today's Outputs page, rename to `OutputsPanel.tsx` in Slice 1 rather than reusing the misleading name.

## Taxonomy (kind-only)

Groups: Documents · Presentations · Spreadsheets · PDFs · Images · Prototypes · Snapshots · Other. Purpose lives in tags (`Document · Resume`, `Prototype · Mobile mockup`, etc.).

"Prototype" is the user-facing Outputs label. "Artifact" is the internal model and inner-tab label.

## Canonical kind→surface map

```ts
export const ARTIFACT_PRESENTATION_MAP = {
  "html-app":        { label: "Interactive Prototype", surface: "draft",      actionLabel: "Open in Draft" },
  "react-component": { label: "React Component",       surface: "stackblitz", actionLabel: "Open in StackBlitz" },
  "project-app":     { label: "Project Application",   surface: "local-dev",  actionLabel: "Open in Local Dev" },
  "deployed-app":    { label: "Live Application",      surface: "live-url",   actionLabel: "Open Live App" },
  "mobile-mockup":   { label: "Mobile Prototype",      surface: "draft", viewport: "mobile", actionLabel: "Open Mobile Preview" },
};
```

Both Outputs and Artifacts read label, icon, "Opens in" text, destination, and viewport from this map.

## Canonical Output ↔ Artifact relationship (verify first)

Durable pointer required — no title/timestamp matching.

```ts
// Option A: pointer on the output
output.artifactId = "artifact-456"
// Option B: canonical id on both
{ outputId, artifactId, canonicalId, kind }
```

## Deep-link contract

1. Resolve canonical artifact id → 2. Read mapped destination → 3. Open Preview → 4. Select tab → 5. Load content → 6. Render → 7. Persist selection in URL/workspace state → 8. Apply viewport.

## Backend assumption — verify, do not assume

Phase 1 is frontend-only ONLY IF the existing artifact endpoint already exposes: canonical artifact id, normalized `kind`, preview content or fetchable reference, associated output id, version info, restore-after-refresh metadata. Verification happens in Slice 1 before Slice 4 starts.

## State ownership

Use existing workspace/shell store. Add new store slice only if no appropriate owner exists. Local state acceptable if parent stays mounted across inner-tab switches.

## Classification cleanup

`outputsClassification.ts` applies these at query time:

| Existing record                             | Destination                                       |
|---------------------------------------------|---------------------------------------------------|
| HTML-APP: Axiom Activity Ledger             | Artifact (`html-app`)                             |
| Downloadable HTML of that ledger            | Output · Prototype, linked via `artifactId`       |
| Timeout snapshot                            | Removed. Timeline only.                           |
| Handoff narration                           | Removed. Conversation only.                       |
| Resume recovery marker                      | Timeline / run details. Not Outputs.              |
| Genuine resume document                     | Output · Document with `resume` tag               |

---

## Sequenced delivery — five small slices

### Slice 1 — Parent navigation + verification
Rename/introduce `OutputsPanel.tsx`; move gallery into `OutputsGallery.tsx`; add `[ All Outputs ] [ Artifacts ]`, All Outputs default; existing list/grid untouched; Artifacts placeholder; remove Artifacts tab from Preview menu; verify backend payload for deep-link needs and document findings.

### Slice 2 — Classification only
Add `outputsClassification.ts`. Prove on current records. No preview routing yet.

### Slice 3 — Semantic presentation map
Add `artifactPresentationMap.ts`. Render semantic label, file-type chip, icon, "Opens in" text, viewport label. No navigation behavior yet.

### Slice 4 — Deep-link, html-app → Draft only
Acceptance: Tap Axiom Activity Ledger from either tab → Preview opens → Draft selected → HTML loaded → rendered automatically → refresh restores the same artifact in Draft.

### Slice 5 — Extend destinations + preserve state
`react-component` → StackBlitz; `project-app` → Local Dev; `deployed-app` → Live URL; `mobile-mockup` → Draft + mobile viewport. Preserve search, filters, layout, scroll, expansion state across inner-tab switches.

---

## Product decisions

1. **Latest version is the primary card.** All Outputs shows one card per item at its latest version. Previous versions are accessible from the card's details / version history, not as duplicate cards.

2. **Prototypes stay project-scoped by default.** Interactive prototypes do not automatically enter the global Library. Users explicitly Save to Library or Publish to promote them.

3. **Card body = open. Chevron/overflow = manage.** Tapping the card body opens the mapped Preview destination immediately. The chevron or overflow menu opens details, versions, download, rename, Save to Library, and delete.

4. **Slices 1–3 make zero schema changes.** If Slice 1 finds that a durable Output–Artifact pointer or canonical artifact fetch is missing, STOP and report:
   - the exact existing payload,
   - the missing field,
   - affected tables/endpoints,
   - the smallest proposed backend correction.
   
   Do not continue to Slice 4 until that report is reviewed.

5. **No text-phrase classification.** Never classify by matching visible strings like "Connection timed out." Use `source`, `kind`, `artifact.type`, or record metadata. If stored data cannot reliably distinguish records, report a data-contract gap — do not add brittle text filters.

---

## Out of scope
Preview tab structure changes; chat/timeline surface changes; new artifact kinds beyond the five mapped; any DB schema change beyond (if unavoidable) an `output.artifactId` pointer surfaced in Slice 1 verification.
