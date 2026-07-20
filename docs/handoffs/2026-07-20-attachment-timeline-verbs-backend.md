# Handoff: Attachment & Turn Timeline Verbs — Backend Emission

**Date:** 2026-07-20
**Repo:** `jochanae/atlas-idk` (monorepo — Replit)
**Owner:** Cursor
**Priority:** P1

## Problem

The workspace timeline currently shows chat messages + commits + decisions
+ sessions. Attachment processing is invisible: users can't see whether
Atlas actually looked at their file, whether it was skipped, or why a
response took 15 seconds. When Atlas fails on an unsupported file, users
have to infer the reason from the reply.

## Goal

Emit structured activity verbs alongside the existing commit/decision
stream, one per turn-lifecycle event. Frontend already accepts them.

## Wire contract (frontend already renders these)

`GET /api/nexus/activity` items — extend the existing `type` union:

```ts
type: "commit" | "decision" | "session"
    | "attachment_received"
    | "image_analyzed"
    | "document_analyzed"
    | "attachment_unsupported"
    | "atlas_thinking"
    | "response_generated";
```

New optional fields on the item:

```ts
attachmentName?: string;  // "quarterly-deck.pptx"
reason?: string;          // "PPTX not yet readable" for _unsupported
```

Everything else (`projectId`, `title`, `subtitle`, `timestamp`, `id`) is
unchanged. Frontend types + renderers are in:

- `artifacts/atlas-frontend/src/hooks/useWorkspaceActivity.ts`
- `artifacts/atlas-frontend/src/components/workspace/SystemActivityCard.tsx`

## When to emit each verb

Emit at these lifecycle hooks in `/api/chat` and `/api/nexus/chat`:

| Verb | When | title example | subtitle |
|---|---|---|---|
| `attachment_received` | after finalize succeeds | "Attached quarterly-deck.pptx" | "2.4 MB · pptx" |
| `image_analyzed` | after model request includes image block | "Analyzed screenshot.png" | one-line detected content if available |
| `document_analyzed` | after extraction + injection into request | "Read quarterly-deck.pptx" | "10 slides · 1,204 words" |
| `attachment_unsupported` | classifier returns `unsupported` OR extraction fails | "Skipped quarterly-deck.pptx" | reason string |
| `atlas_thinking` | model stream starts | "Thinking…" | omit |
| `response_generated` | model stream completes cleanly | "Responded" | ms + token count if handy |

Rules:

- One event per attachment per turn — no duplicates on retry.
- `atlas_thinking` and `response_generated` are quiet (batched on the
  rail); the frontend already classifies them as such.
- All verbs carry `projectId` — Ask Atlas turns without a project can use
  the user's default project id.
- Include a stable `id` so the frontend can dedupe across polls.

## Verification checklist

- [ ] Send a PNG in workspace → `attachment_received` then
      `image_analyzed` appear in the rail in order.
- [ ] Send a PPTX (still unsupported) → `attachment_received` then
      `attachment_unsupported` with `reason: "PPTX not yet readable"`.
- [ ] A turn with no attachments still emits `atlas_thinking` +
      `response_generated`.
- [ ] Rapid double-send does not duplicate events (idempotency on id).

## Out of scope

- Attachment extraction itself — see the companion capability-matrix
  handoff.
- New activity storage schema; add columns to existing activity table.
