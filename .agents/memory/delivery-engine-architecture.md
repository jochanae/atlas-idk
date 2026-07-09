---
name: Delivery Engine Architecture
description: How artifact generation (Artifact Engine) is separated from distribution (Delivery Engine) via a pluggable adapter contract.
---

Atlas splits "creating" an artifact from "distributing" it into two independent systems: the Artifact Engine renders/stores a file-backed artifact; the Delivery Engine sends an already-generated artifact somewhere (email/Slack/PR today).

**Why:** provider outages or misconfiguration (Resend down, bad Slack token, GitHub auth expired) must never retroactively mark a successful artifact generation as failed. Generation and distribution have different failure domains and different retry semantics — coupling them made early error handling ambiguous about which step actually failed.

**How to apply:**
- Every provider implements the same adapter interface: `validateTarget(target)` (throws on bad input) + `send(target, context)` (throws on provider failure, returns a provider-specific `externalRef` on success).
- Adapters self-register via side-effect import (same pattern as artifact renderers) — the engine, routes, and UI never branch on provider name.
- `deliverArtifact()` never throws for provider failures — it always writes a `deliveries` row (pending → sent/failed) and returns a result object; only structurally-wrong calls (unknown provider, invalid target, missing artifact) throw before any row is written.
- Slack is intentionally NOT wired into artifact generation directly — it is only reachable through the Delivery Service's adapter contract, matching a specific product directive to keep provider concerns out of the generation path even for the single-workspace-bot-token phase (per-user OAuth Slack is deferred to a future Connectors/MCP layer).
