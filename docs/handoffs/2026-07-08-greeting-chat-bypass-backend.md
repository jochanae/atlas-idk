# Handoff: Greeting/Small-Talk CHAT Bypass + CHAT Silence on Capture Cards

**Repo:** `Axiom-Atlas` (backend, Cloud Run)
**Owner:** Cursor
**Priority:** P1 — chat-path polish. Depends on / extends `2026-07-08-whispergate-safety-inversion-backend.md`.

---

## Symptom

User sent: `Hey, how are you`
Atlas replied correctly ("Doing well — ready to work.") but the UI **also** rendered "Capturing intent" and "Saved response" cards, plus an unsolicited status brief about the Obsidian Ledger project.

Pure small talk is landing in DECIDE (or DECIDE-adjacent) mode and surfacing memory-capture artifacts.

Note: the sibling handoff (`whispergate-safety-inversion`) inverts the *fallback* from BUILD→DECIDE. That is correct for uncertainty, but it makes THIS symptom worse for confident-greeting turns unless CHAT has a hard bypass and DECIDE-lite turns stop emitting capture cards.

---

## Scope

Two files, same as sibling handoff — apply after or alongside it:

1. `artifacts/api-server/src/lib/whisperGate.ts`
2. `artifacts/api-server/src/routes/nexus.ts`

No schema, no new endpoints.

---

## Changes

### 1. `whisperGate.ts` — pre-classifier CHAT bypass

Before invoking the LLM classifier, run a cheap regex check. If it matches, return CHAT immediately and skip the model call.

```ts
const CHAT_BYPASS = /^\s*(hey|hi|hello|yo|sup|good\s+(morning|afternoon|evening|night)|how\s+(are|r)\s+(you|u|ya)|what's\s+up|whats\s+up|wassup|thanks|thank\s+you|ty|ok(ay)?|cool|nice|great|awesome|lol|haha|👋|🙏)\b[\s!?.,]*$/i;

const trimmed = latestUserMessage.trim();
if (trimmed.length < 40 && CHAT_BYPASS.test(trimmed)) {
  return {
    intent: "CHAT",
    confidence: "high",
    reason: "greeting_bypass",
    fallback: false,
    elapsedMs: 0,
    model: "regex",
  };
}
```

Log the bypass with the same `whisperGate.turn` structured event so it's countable.

### 2. `nexus.ts` — CHAT emits nothing except the reply

CHAT turns must not:

- persist an `execution_run` row
- emit `event: intent` / `event: capture` / `event: saved` SSE frames
- trigger Tier1 extraction, memory writes, or ledger inserts
- fetch project-state briefings and inject them into the system prompt (this is why the greeting produced an Obsidian Ledger status recap)

Concretely:

```ts
if (intent === "CHAT") {
  // Skip: persistNexusExecutionRun, emitIntentCapture, emitSavedResponse,
  // tier1Extract, projectStateBriefing, ledgerAutoInsert
  // Keep: system prompt + streaming reply + `event: meta` with { intent: "CHAT" }
}
```

DECIDE turns may surface memory (read-only) and produce a DECIDE-block response, but they also must not emit "Capturing intent" / "Saved response" UI events unless the DECIDE block actually resolves to a Commit. Capture cards should fire on **commit**, not on classification.

### 3. Project-state briefing gate

Currently the system prompt appears to auto-append a project status summary ("The Obsidian Ledger is sitting at an interesting point…") on every turn where a project is active. Gate this on:

```ts
const shouldBrief = intent !== "CHAT" && userAskedAboutProject(latestUserMessage);
```

Where `userAskedAboutProject` is a keyword check (`status`, `where are we`, `progress`, `what's next`, project name mention, etc.). Greetings should get a greeting back — nothing else.

---

## Acceptance

1. `curl` `/api/nexus/chat` with `{"messages":[{"role":"user","content":"hey"}]}` inside an active project context → intent CHAT (reason `greeting_bypass`), **no** `event: intent`, **no** `event: capture`, **no** project briefing in the reply. Reply is a short greeting only.
2. `"how are you"` → same as above.
3. `"what's the status of the Obsidian Ledger"` → intent DECIDE or CHAT, project briefing allowed.
4. `"I'm thinking about pivoting the ledger to markdown-only"` → intent DECIDE, DECIDE response allowed, **no** capture card unless user commits.
5. `"Commit: markdown-only ledger"` → capture card fires (this is the correct trigger).
6. Every turn still emits `event: meta` with `{intent, justTalk, fallback}` per the sibling handoff.

---

## Non-goals

- No frontend edits. Frontend already suppresses cards on CHAT once `event: meta` lands.
- Do not remove DECIDE capture entirely — only stop it from firing on classification. It fires on Commit.
- Do not touch the CHAT bypass regex to be clever with NLP — keep it a boring allowlist.
