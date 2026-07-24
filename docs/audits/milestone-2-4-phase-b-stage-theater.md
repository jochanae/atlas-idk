# Milestone 2.4 Phase B — Kill Stage Theater

**Date:** 2026-07-24  
**Branch:** `cursor/milestone-2-4-phase-b-stage-theater-2010`  
**Design:** [`milestone-2-4-natural-conversation-design.md`](./milestone-2-4-natural-conversation-design.md)

---

## Thesis (locked)

Remove conversational ceremony that exists to explain the application's internal process. Preserve only language that helps the user understand the work itself. The conversation should feel like collaborating with someone who simply continues the task — not like operating a workflow engine.

**Replacement rule:** Preserve work language; delete process language.

---

## What changed

| Area | Change |
|------|--------|
| `workLanguageNextAction` | Shared helper — open question / constraint or empty; no Mad Libs |
| Genome / intelligence health | Uses helper; empty fallbacks |
| GenomeCard | Removed Stage bar + Joy State track; “Open” only when real |
| Portfolio cards | No atlasState stage label; omit empty next-action row |
| Manifest | “Joy still needs” → “Open” (questions only); no homework Next |
| Memory HUD | No Exploration/Shaping/Forming stage row |
| DecisionGate | Work-forward copy; not “Joy needs / waiting” |
| Insights | Quiet empties (`—`); no capture-checklist missingHints |
| FilesPanel | Removed `{lens} lens` badge |
| Nexus overview close | No “Which perspective?” menu |
| CommitPill | Quieter mid-flight labels (stretch) |

---

## Boundaries (locked)

**Not in Phase B (Phase C):** interrupt/resend, renderer, false generating, outputs honesty.  
**Not in Phase B (Phase D):** Idea Mode / CONV_STATE / ATLAS STATE prompt posture (injection may still exist server-side; user-facing stage chrome removed).

---

## Acceptance

| Check | Status |
|-------|--------|
| S2 — no `"Answer:…"` / Shape Mad Libs from health | Helper + unit tests |
| No stage track as conversational driver | Genome / Portfolio / HUD |
| N5 / N7 — no unsolicited stage/mode vocabulary in chrome | Lens badge + perspective menu removed |
| **Blind Read Test** | Reviewer reads Genome/Portfolio/Manifest/Insights/HUD/DecisionGate/Files — must understand work without reconstructing a workflow engine |

---

## Status

**IN PROGRESS** — landing Phase B implementation.
