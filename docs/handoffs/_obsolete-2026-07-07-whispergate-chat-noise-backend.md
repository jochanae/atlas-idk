# [OBSOLETE 2026-07-07] Backend Handoff — WhisperGate on `/api/chat`

> **DO NOT USE.** Written under the false assumption that the backend lived in a separate Cloud Run repo. The backend is `artifacts/api-server/` in THIS repo. The workspace chat path is `/api/nexus/chat` (nexus.ts), not `/api/chat`. The real run-card fix was landed directly in `nexus.ts` (early-return when `mode === "conversation"`). Kept for history only.

**Date:** 2026-07-07
**Repo:** `Axiom-Atlas` (Cloud Run) — NOT the Lovable frontend repo
**Target route:** `POST /api/chat` (workspace chat only; `/api/nexus/chat` is out of scope)
**Symptom:** In workspace, sending "hello" (or any pure chat) renders a run card, step chips, and can trigger GitHub bootstrap. Root cause: the chat pipeline runs operational side-effects on every turn regardless of intent.
**Fix:** Add a pre-classifier (WhisperGate) that routes each turn as `CHAT | DECIDE | BUILD`. On `CHAT`, suppress step events, strip operational markers from model output, and skip build ops.

The Lovable frontend already ships the client-side counterpart (`useChatStream` listens for a `type: "intent"` SSE event and hides the run card when `intent === "CHAT"`). Nothing more is required on the frontend once this backend lands.

---

## 1. New file: `src/lib/whisperGate.ts`

Copy verbatim from the Lovable repo at `artifacts/api-server/src/lib/whisperGate.ts`. Key contract:

```ts
export type WhisperIntent = "CHAT" | "DECIDE" | "BUILD";
export interface WhisperResult {
  intent: WhisperIntent;
  confidence: number;   // 0..1
  reason: string;
  fallback: boolean;    // true → classifier failed, defaulted to BUILD
  elapsedMs: number;
}
export async function classifyIntent(input: {
  message: string;
  history?: Array<{ role: string; content: string }>;
  workspaceLens?: string;
  hasProjectContext?: boolean;
}): Promise<WhisperResult>;
```

Implementation notes:
- Model: `claude-haiku-4-5`, `max_tokens: 80`, no streaming, no thinking.
- Timeout: 1500ms hard cap (Promise.race).
- Trivial short-circuits (no model call):
  - Empty message → `CHAT`, confidence 1.
  - Regex `^(hi|hello|hey|yo|sup|hola|good\s+(morning|afternoon|evening))[!.\s]*$` → `CHAT`, confidence 1.
- On timeout / parse error / invalid intent → return `{ intent: "BUILD", fallback: true }`. **Never worse than today**, because today's behavior is BUILD-for-everything.
- System prompt: use the `SYSTEM` constant verbatim from the Lovable file. Do not paraphrase — the ambiguity rules ("when unsure between CHAT and BUILD, pick CHAT"; "yes/go/do it → look at prior assistant turn") are the whole point.
- Requires `ANTHROPIC_API_KEY` env (already set in Cloud Run).

## 2. Edits to `src/routes/chat.ts`

### 2a. Import (top of file)

```ts
import { classifyIntent, type WhisperIntent } from "../lib/whisperGate";
```

### 2b. Inside the `router.post("/chat", …)` handler, at the very top

```ts
let whisperIntent: WhisperIntent = "BUILD";
const writeStep = (res: Response, s: { verb: string; target?: string; phase: string }) => {
  if (whisperIntent === "CHAT") return; // suppress run-card step events on CHAT turns
  try { res.write(`data: ${JSON.stringify({ type: "step", ...s })}\n\n`); } catch {}
};
```

If a `writeStep` helper already exists, replace it with this version. All existing call sites keep working.

### 2c. Classify BEFORE any operational side-effects

Place this immediately after `projectId` / `userId` / `history` / `message` are resolved and BEFORE:
- GitHub bootstrap / repo checks
- Build ops
- Step emissions
- Model call

```ts
try {
  const whisper = await classifyIntent({
    message,
    history,
    workspaceLens: body.workspaceLens ?? body.lens,
    hasProjectContext: !!projectId,
  });
  whisperIntent = whisper.intent;
  // Tell the client immediately — useChatStream listens for type:"intent"
  res.write(`data: ${JSON.stringify({
    type: "intent",
    intent: whisper.intent,
    confidence: whisper.confidence,
    reason: whisper.reason,
    fallback: whisper.fallback,
  })}\n\n`);
  logger.info({ intent: whisper.intent, confidence: whisper.confidence, reason: whisper.reason, fallback: whisper.fallback, elapsedMs: whisper.elapsedMs, projectId }, "whisperGate: routing turn");
} catch (err) {
  logger.warn({ err: String(err) }, "whisperGate: unexpected outer error, defaulting to BUILD");
  whisperIntent = "BUILD";
}
```

### 2d. Gate the operational side-effects

Wrap the following blocks with `if (whisperIntent !== "CHAT") { … }`:

- GitHub repo bootstrap / `ensureRepo` / `REPO_LINK` emission
- `BUILD_RUN` execution
- Any `writeStep(...)` calls that emit "reading repo", "checking files", "planning", etc.
- Any pre-model tool preflight that produces user-visible chips

DECIDE keeps most tools off too, but leaves DECIDE-block emission intact. Safe default: gate the same blocks on `whisperIntent === "BUILD"` if easier.

### 2e. Scrub operational markers from model output on CHAT

Right after the raw model response is assembled into `rawContent` and BEFORE token extraction runs:

```ts
if (whisperIntent === "CHAT") {
  const strippedMarkers: string[] = [];
  const scrub = (re: RegExp, name: string) => {
    rawContent = rawContent.replace(re, () => { strippedMarkers.push(name); return ""; });
  };
  scrub(/FILE_EDIT_START[\s\S]*?FILE_EDIT_END/g, "FILE_EDIT");
  scrub(/^REPO_LINK:\s*\{[^\n]*\}\s*$/gm, "REPO_LINK");
  scrub(/^GITHUB_PUSH:\s*\{[^\n]*\}\s*$/gm, "GITHUB_PUSH");
  scrub(/^GITHUB_READ:\s*\{[^\n]*\}\s*$/gm, "GITHUB_READ");
  scrub(/^BUILD_RUN:\s*[^\n]+$/gm, "BUILD_RUN");
  scrub(/^IMAGE_GEN:\s*\{[^\n]+\}\s*$/gm, "IMAGE_GEN");
  scrub(/^BROWSER_VISIT:\s*\{[^\n]+\}\s*$/gm, "BROWSER_VISIT");
  scrub(/^SHELL_RUN:\s*\{[^\n]+\}\s*$/gm, "SHELL_RUN");
  scrub(/^DATA_FETCH:\s*\{[^\n]+\}\s*$/gm, "DATA_FETCH");
  if (strippedMarkers.length > 0) {
    logger.info({ strippedMarkers, projectId }, "whisperGate: CHAT turn — stripped operational markers");
  }
  rawContent = rawContent.trim();
}
```

This is belt-and-braces: even if the model ignores intent and emits `BUILD_RUN`, the client never sees it on a CHAT turn.

---

## 3. SSE contract (client already implements this)

Two new event types on the stream. Both are additive — existing events unchanged.

```
data: {"type":"intent","intent":"CHAT","confidence":1,"reason":"greeting","fallback":false}
```

Emitted exactly once, immediately after classification, before any `step`/`token`/`done` events.

No changes needed to `type: "step"`, `type: "token"`, `type: "done"` shapes.

---

## 4. Test cases (must all pass before deploy)

Run inside workspace (any project). Expected result = observed on client.

| # | Input | Expected `intent` | Run card? | GitHub ops? | Notes |
|---|---|---|---|---|---|
| 1 | `hello` | `CHAT` (short-circuit, 0ms) | No | No | Regex hit |
| 2 | `how are you today` | `CHAT` | No | No | Model call |
| 3 | `what do you think about the ledger design` | `CHAT` or `DECIDE` | No | No | Either is fine |
| 4 | `should I use postgres or sqlite` | `DECIDE` | No | No | Options request |
| 5 | `add a delete button to the ledger card` | `BUILD` | Yes | Yes | Real build |
| 6 | `push this to github` | `BUILD` | Yes | Yes | Explicit op |
| 7 | `yes go ahead` after Atlas proposed a build | `BUILD` | Yes | Yes | Prior-turn context |
| 8 | `yes` after Atlas asked "which of these do you want" | `DECIDE` | No | No | Prior-turn context |
| 9 | Simulate Anthropic 500 → fallback fires | `BUILD` (fallback:true) | Yes | Yes | No regression vs. today |

Log check: every request should log one `whisperGate: routing turn` line with `elapsedMs`. Median should be <300ms; 95p <1500ms (timeout).

---

## 5. Out of scope

- `/api/nexus/chat` (Ask Atlas / home). Same class of noise does not exist there today per user report. If it emerges, mirror this handoff on the nexus route.
- Frontend changes. `useChatStream` already listens for `type: "intent"` and hides the run card. `useNexusChatStream` untouched.
- Schema changes. None.

---

## 6. Rollback

Feature-gate on env `WHISPER_GATE_ENABLED=true`. When unset or `false`, skip classification and leave `whisperIntent = "BUILD"`. This yields exactly the pre-fix behavior.

```ts
if (process.env.WHISPER_GATE_ENABLED === "true") {
  // classify + emit intent
} else {
  whisperIntent = "BUILD";
}
```

Deploy with the env unset first, flip it on in Cloud Run once logs look clean.
