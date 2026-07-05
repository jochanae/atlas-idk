# Handoff — Tier 1 Nexus/Ask-Atlas parity (backend)

**Date:** 2026-07-05
**Repo:** `Axiom-Atlas` (Cloud Run)
**Depends on:** `2026-07-05-tier1-conversational-fill-backend.md` (must be live —
`tier1_upsert_field` + `tier1_mark_skipped` tools + `services/tier1.ts` shared
writer + `tier1_skipped_at` migration).
**Consumer:** already-shipped FE `Tier1ProgressCard` — no FE change needed after
this lands. Progress chips will fill in automatically as Nexus captures fields,
because the card polls `GET /api/memory/tier1/:projectId` every 20s.

**Goal:** Whatever the user tells Atlas in Ask-Atlas / Nexus (before or after
picking a project) can satisfy Tier 1 for the eventual project — same 6
answers, same table, same tool. One canonical intake surface, three ways in
(Forge stepper · workspace chat · Nexus chat).

---

## The setup you already have

Ask-Atlas / Nexus surfaces call these routes (frontend refs):

- `POST /api/nexus/chat` — streaming chat loop
- `POST /api/nexus/handoff` — called when the user opens a project from Nexus;
  body is `{ messages: last 10 UIMessage[], projectId, conversationId }`
- `POST /api/nexus/shaping` — the shaping/intent capture write path
- `GET  /api/nexus/thread` / `/api/nexus/conversations` / `/api/nexus/resume`

Tier 1 fields (6):
`building · audience · problem · outOfScope · successSignal · constraints`.

---

## 1. Register `tier1_upsert_field` on the Nexus agent loop

The Nexus chat agent (`POST /api/nexus/chat`) must expose the same
`tier1_upsert_field` and `tier1_mark_skipped` tools as `atlas-chat`.

Key difference: **Nexus is often pre-project.** At the time the user is
talking, there may not be an active `projectId` yet.

Handling:

- If the conversation is already bound to a project (`conversationId` maps to a
  project, or the client sent `projectId`), call the shared upsert exactly like
  atlas-chat.
- If no project is bound yet, **buffer** the fields on the conversation, not on
  a project. Store them on the Nexus conversation row (new nullable JSONB
  column, see §3). Do NOT invent a placeholder project.

Reuse `services/tier1.ts` — do not fork the write logic.

---

## 2. Inject Tier 1 status into the Nexus system prompt

Same block as atlas-chat, with one extra branch for the "no project yet" case:

```ts
const tier1Block = projectId
  ? await buildTier1BlockForProject(projectId)      // identical to atlas-chat
  : buildTier1BlockForNexusConversation(conversationBuffer);
```

For the no-project case:

```
<tier1_status scope="pre-project">
The user has not selected a project yet. If they describe what they're
building, who it's for, the problem, out-of-scope, success signal, or
constraints — capture the field with tier1_upsert_field. It will be
buffered on this conversation and flushed to the project's Tier 1 memory
when they open/create a workspace.
Never interrogate. One field per turn max. Do not mention "Tier 1" by name.
</tier1_status>
```

---

## 3. Buffer schema (nullable — do nothing if row absent)

Add to whatever table stores Nexus conversations (likely
`nexus_conversations` or equivalent — reuse whatever is already there):

```sql
ALTER TABLE nexus_conversations
  ADD COLUMN tier1_buffer JSONB NULL,
  ADD COLUMN tier1_skipped_at TIMESTAMPTZ NULL;
```

`tier1_buffer` shape mirrors `Tier1Answers`:

```json
{
  "building": "…",
  "audience": "…",
  "problem": null,
  "outOfScope": null,
  "successSignal": null,
  "constraints": null
}
```

Upsert semantics: only overwrite a key when the incoming `confidence` is
`explicit` OR the existing value is null.

---

## 4. Flush the buffer on handoff

Extend `POST /api/nexus/handoff` (body already carries `projectId`,
`conversationId`, `messages`).

New behavior at the end of the existing handoff handler:

```ts
const buf = await getNexusTier1Buffer(conversationId);
if (buf && projectId && await assertProjectOwner(projectId, userId)) {
  const existing = await loadTier1ForProject(projectId);
  const merge: Partial<Tier1Answers> = {};
  for (const key of TIER1_KEYS) {
    const incoming = buf[key]?.trim();
    if (!incoming) continue;
    if (!existing?.[key]?.trim()) merge[key] = incoming; // never overwrite a real answer
  }
  if (Object.keys(merge).length > 0) {
    await upsertTier1(projectId, merge);               // services/tier1.ts
    await appendTier1LedgerEntry(projectId, {
      source: "nexus_handoff",
      fields: Object.keys(merge),
    });
  }
  await clearNexusTier1Buffer(conversationId);         // buffer consumed
}
```

Rules:
- Never overwrite an existing Tier 1 field. Buffer only fills gaps.
- If the buffer contains a `tier1_skipped_at` and the target project has no
  Tier 1 row yet, propagate the skip (so the FE progress card stays quiet and
  the auto-open sheet does not fire — the FE already respects `skippedAt`).
- Same idempotency as atlas-chat writes: one Ledger entry per flush, not per
  field.

---

## 5. Also flush on project creation from Nexus

If Nexus has a "create project from this conversation" path (common — check
`AskAtlasSurface.onCreateProject` on the FE), the newly-created project should
receive the buffer flush inside the same transaction that creates the project.
Reuse the same flush helper — do not duplicate.

If no such server path exists yet, the handoff flush in §4 is sufficient
(FE creates → navigates → handoff fires on the way in).

---

## 6. Serializer / REST — no changes

`GET /api/memory/tier1/:projectId` already returns `answers · updatedAt ·
skippedAt · missing[]` after the previous handoff. FE polls it. Nothing new to
expose.

Optionally (nice-to-have, not required): add
`GET /api/nexus/tier1-buffer?conversationId=…` returning the current buffer,
so a future Nexus-side progress card can render pre-project. Skip for now
unless trivial.

---

## 7. Guardrails

Same voice rules as atlas-chat:

- Never batch-ask Tier 1 questions.
- Never announce "onboarding" / "Tier 1" / "setup".
- One field per turn max. Opportunistic, not interrogative.
- Pushback ("stop asking", "skip that") → call `tier1_mark_skipped`. In
  pre-project mode, set `tier1_skipped_at` on the conversation buffer; the
  handoff flush propagates it.

---

## 8. Acceptance

1. In Ask-Atlas with no project, say *"I'm building a decision-led builder for
   solo founders who ship without a team."* — logs must show two
   `tier1_upsert_field` calls (`building`, `audience`) writing to the
   conversation buffer.
2. Open/create a project from that conversation. `GET /api/memory/tier1/:id`
   returns those two fields, `missing` reflects the other four, `skippedAt`
   null. FE progress card shows 2/6 filled automatically.
3. Existing project already has `building = "X"`. Say the same sentence in
   Nexus, then handoff. Tier 1 `building` still equals `"X"` (no overwrite).
   `audience` gets filled if it was empty.
4. Say *"stop asking me setup questions"* in Nexus pre-project → conversation
   buffer's `tier1_skipped_at` set. Handoff into a fresh project → that
   project's Tier 1 row is created with `tier1_skipped_at = now()`; FE
   progress card renders the muted "Atlas listening" mode instead of the
   active pulse.
5. One Ledger entry per handoff-flush event (not per field). Source tagged
   `nexus_handoff` or similar so it's distinguishable from Forge stepper
   commits.

---

## Files likely touched

- `services/tier1.ts` — export `upsertTier1(projectId, Partial<Tier1Answers>)`
  helper if not already there (atlas-chat tool handler should use it too).
- Nexus chat agent (Cloud Run equivalent of `atlas-chat` handler) — register
  the two tools, inject Tier 1 status block.
- Nexus conversation schema — 2 nullable columns.
- `routes/nexus/handoff.ts` (or equivalent) — flush logic at end of handler.
- Nexus project-create path (if it exists server-side) — flush hook.

No FE changes required after this ships. The `Tier1ProgressCard` will start
filling in from Nexus captures on the next poll cycle (≤20s) or on window
focus.
