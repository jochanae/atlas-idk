---
name: Decision Intelligence artifact architecture
description: How Tradeoff Matrix / Decision Tree / Deviation Log artifacts are generated, persisted, and rendered
---

Decision artifacts (tradeoff_matrix, decision_tree, deviation_log) reuse the generic `project_artifacts` table and the generic `GET/POST /projects/:id/artifacts` routes — no dedicated list/reopen endpoint was needed since that route has no type whitelist.

**Why:** avoids schema/route duplication and keeps "No Duplicate Truth" — same storage and reopen path as pipeline sketches, docs, etc.

**How to apply:** when adding a new structured-artifact type in Axiom, prefer generating via a dedicated `POST /projects/:id/decisions/<slug>/generate` (or similar) endpoint that calls a Claude generator + `saveDecisionArtifact`-style helper (which also writes a linked `entries` Ledger row via `enrichmentJson: {artifactId, artifactType, artifactVersion}`, status `"committed"`), but list/reopen through the existing generic artifacts route filtered by `type`. Reload-hydration for chat-inline rendering must be threaded through three layers: nexus.ts message-history hydration (mirror the `imageGen` pattern), `useNexusChatStream.ts` NexusMessage type + onDone propagation, and `useNexusWorkspaceBridge.ts` `toChatMessage()` mapping into `ChatMessage`.
