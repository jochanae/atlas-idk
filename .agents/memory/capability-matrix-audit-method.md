---
name: Capability matrix verification method
description: How to re-verify MASTER_CAPABILITY_MATRIX.md against code instead of chat claims or roadmap intent
---

`docs/MASTER_CAPABILITY_MATRIX.md` is Atlas's source of truth for what's actually built vs. planned. External/chat-derived capability audits (e.g. comparisons against Cursor/Notion/Gamma) tend to be built on stale prior versions of this file and should never be trusted as-is — always re-verify against the live repo before updating statuses.

**Why:** a prior audit round assumed the matrix was current and produced a "biggest gaps" ranking that was wrong on F2 (Source Intelligence) and F3 (Artifact Engine) — both had real, tested, wired implementations the matrix still listed as ✗. Acting on the stale ranking would have deprioritized real gaps (F6 Visual QA, brand/voice identity) in favor of already-solved problems.

**How to apply:** when asked to verify or update the matrix, check each Foundation (F1–F10) directly:
- Grep/list the actual lib/route directories named in the matrix's "Description" column before trusting its status symbol.
- For engines claiming ✗, search for the expected file names/directories first — many are further along than the doc says.
- For engines claiming ✓/shipped, grep for the specific missing sub-capability (e.g. `formula` in a spreadsheet renderer, `voiceProfile`/`brandKit` in schema) before accepting full completeness.
- Read gated/stub branches (e.g. explicit `501` responses) directly — "returns 501 for X" is a different, more honest claim than "silently broken" or "fully missing."
- Status legend now has 5 levels (❌ not started / △ foundation shipped / ○ partial / ✓ complete / ★ production-quality) — collapsing ○/✓/★ into one bucket is the most common staleness failure mode; "the code runs" and "you'd show a customer" are different claims and must be tracked separately.
- Stamp every verification pass with `Verified against commit <sha> on <date>` in the file header so the next audit knows what baseline it's diffing against.
