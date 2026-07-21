# Continuity V2 — Live Environment Verification

**Date:** 2026-07-21  
**Goal:** Determine whether the Founder Walkthrough ran with V2 enabled, using runtime proof — not repo inference.

## 1. Can this agent confirm the walkthrough API process?

**No — not from this cloud-agent pod.**

| Check | Result |
|---|---|
| Local Atlas API process in this pod | **None** (only Cursor exec-daemon) |
| `ATTACHMENT_CONTINUITY_V2` in agent environment | **Unset** |
| `https://axiomsystem.app/api/capabilities` | Frontend HTML on `/`; `/api/*` → **502** “deployment could not be reached” |
| `https://axiomatlas.replit.app/api/capabilities` | **502** |
| Restart/redeploy proof for walkthrough API | **Not obtainable** until the serving process is reachable |

So we **cannot** yet truthfully answer “was V2=1 on the exact process that served your walkthrough?” from live process inspection. That requires the development API host to be up, then:

```bash
curl -sS https://<your-dev-api-host>/api/capabilities
# Expect:
# {
#   "attachmentPersistence": ...,
#   "attachmentContinuityV2": true|false,
#   "apiProcessStartedAt": "ISO-8601",
#   "apiProcessUptimeSec": <number>
# }
```

- `attachmentContinuityV2: true` ⇔ `ATTACHMENT_CONTINUITY_V2=1` **on that process**  
- Compare `apiProcessStartedAt` to when the env var was added (must be **after** add → restart/redeploy)

## 2. Temporary request-level proof (shipped in this PR)

### Capabilities (safe, public)

`GET /api/capabilities` now includes:

- `attachmentContinuityV2`
- `apiProcessStartedAt`
- `apiProcessUptimeSec`

### Nexus chat structured log

Every `/api/nexus/chat` turn emits:

```
event: "nexus.continuity.diag"
```

Fields (no file contents, storage paths, secrets, or DB UUIDs):

| Field | Meaning |
|---|---|
| `continuityV2Enabled` | Flag active on this process |
| `conversationIdPresent` | Client sent a conversationId |
| `priorCandidateCount` | Priors discovered for history messages |
| `priorModelReceivedCount` | Priors with `model_injected_at` |
| `priorBytesRetrievableCount` | Priors with retrievable bytes |
| `relevanceSelectedCount` | How many priors relevance picked |
| `relevanceReasons` | `publicRef:reason` only |
| `historicalReopenAttempted` | Resolve called for historical ids |
| `historicalReopenResolvedCount` | Successfully reinjected |
| `historicalReopenSkippedCount` | Skipped |
| `historicalReopenSkipReasons` | Machine reasons (e.g. `download_failed`) |
| `failureReasonCode` | Single stop code (see below) |
| `currentTurnAttachmentRequestCount` | This request’s attachmentIds length |
| `slideQuestionLikely` | Message matches `slide N` |

### `failureReasonCode` → branch map

| Code | Branch |
|---|---|
| `flag_disabled` | **(1)** Implementation never enabled |
| `missing_conversation_id` | **(2)** Prior discovery failed (no conversation scope) |
| `prior_candidates_zero` | **(2)** Prior discovery failed (no linked priors in history) |
| `relevance_selected_none` | **(2)** Discovered but not selected (phrasing) — unexpected for “What did slide 6 say?” if candidates > 0 |
| `not_uploaded` / `processing_*` / `download_failed` / `historical_reopen_resolved_zero` / `historical_reopen_threw` | **(3)** Discovered + selected, reopen failed later |
| `null` + `historicalReopenResolvedCount > 0` | Reopen succeeded |

## 3. Clean PowerPoint test procedure (after deploy)

1. Confirm `GET /api/capabilities` → `attachmentContinuityV2: true` and a fresh `apiProcessStartedAt`.  
2. New conversation.  
3. Attach PPTX → confirm Atlas reads it.  
4. Next turn, no attach: `What did slide 6 say?`  
5. Read server log line `nexus.continuity.diag` for that follow-up.

### Interpret

| Diag on follow-up | Conclusion |
|---|---|
| `continuityV2Enabled: false` / `flag_disabled` | Walkthrough was **invalid flag-off**; not an implementation failure |
| `enabled: true`, `priorCandidateCount: 0` | **(2)** discovery/linkage/conversation failure (inspect refresh + DB rows) |
| `priorCandidateCount > 0`, `relevanceSelectedCount > 0`, reopen resolved 0 / skip reasons | **(3)** reopen failed later |
| `historicalReopenResolvedCount > 0` and Atlas answers | V2 path healthy |

## 4. Status of this step

| Item | Status |
|---|---|
| Confirm walkthrough process env live | **Blocked** — serving `/api` returns 502 from this network |
| Add capabilities + diag logs | **Done** (this PR) |
| Repeat clean PPTX test against live | **Blocked** until API is reachable / redeployed with this build + `ATTACHMENT_CONTINUITY_V2=1` |
| Apply continuity “fix” | **Deferred** until diag identifies branch 1 / 2 / 3 |

**Immediate action for founder/ops:** bring the development API back up, set `ATTACHMENT_CONTINUITY_V2=1`, restart/redeploy, hit `/api/capabilities`, then run the clean PPTX test and capture one `nexus.continuity.diag` log line.
