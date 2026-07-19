# Axiom

A unified development environment: React+Vite frontend + Express API + Replit PostgreSQL.

See `replit.md` for the full project overview, stack details, and operational gotchas.

---

## Architecture before editing

**Read these documents before modifying any conversation surface, transport hook, API route, or attachment handler.**

| Document | What it covers |
|---|---|
| [docs/architecture/runtime-map.md](docs/architecture/runtime-map.md) | Every live conversation surface mapped with component, route, payload, attachment support, and persistence behavior. Classification of each path as CANONICAL / LIVE TRANSITIONAL / LEGACY BUT REACHABLE / DEAD. |
| [docs/architecture/conversation-ownership.md](docs/architecture/conversation-ownership.md) | Exact division of responsibility between `useAtlasConversation`, `useNexusWorkspaceBridge`, `useNexusChatStream`, `useChatStream`, `/api/nexus/chat`, and `/api/chat`. |
| [docs/architecture/attachment-ownership.md](docs/architecture/attachment-ownership.md) | The canonical attachment pipeline from file-pick through base64 conversion, transport, server ack, and failure recovery. Non-canonical bypass paths documented. |
| [docs/architecture/agent-change-rules.md](docs/architecture/agent-change-rules.md) | Rules for making changes safely: send rules, attachment rules, workspace.tsx rules, backend rules, classification criteria, and migration roadmap. |

The governing principle: the Workspace currently runs **two conversation hooks simultaneously** — `useAtlasConversation` (CANONICAL) and `useChatStream` (LIVE TRANSITIONAL). The Nexus path wins for display and user-initiated sends. `useChatStream` still owns session IDs and automated side-sends. Do not remove either hook without completing the Phase 2 migration documented in [conversation-ownership.md](docs/architecture/conversation-ownership.md).

---

## Direct-caller check

```bash
pnpm --filter @workspace/scripts run check-direct-callers
```

Reports (but does not fail) when new direct callers of `/api/chat`, `/api/nexus/chat`, `useChatStream(`, or `fileToBase64Safe` appear outside the known set. Run after any PR that touches conversation surfaces.
