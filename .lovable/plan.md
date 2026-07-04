# Plan: Unify workspace chat onto the Nexus conversation spine

**Status:** Draft — needs user approval before execution.
**Owner surface:** Frontend only. No backend edits from Lovable (backend handoff spec at the end).

---

## Goal

Keep the workspace shell, panels, tabs, files, preview, ledger, terminal, workbench, run cards. Replace **only** the conversation engine with the same one Ask Atlas uses. One smart surface. Nexus becomes the brain behind the workspace chat; workspace tools still execute here.

Success test: user sends a message in workspace → same speed, same feel, same streaming rhythm as Ask Atlas → run cards, plans, files still fire.

---

## Ground truth (from scan)

| File | Lines | Role |
|---|---|---|
| `hooks/useNexusChatStream.ts` | 691 | Powers Ask Atlas + home. Clean. Already used twice on `home.tsx`. |
| `hooks/useChatStream.ts` | 1,121 | Workspace-only. Owns chat AND ~15 workspace side effects. |
| `pages/workspace.tsx` | 9,678 | Mounts `useChatStream` and passes 20+ setters into it. |

`useChatStream` is not a chat hook. It is the workspace's nervous system with chat bolted on. That is the reason for the slowness and why swapping is not one line.

---

## What `useChatStream` currently owns (must be re-homed)

From reading the hook signature (`hooks/useChatStream.ts:70-115`):

**Pure chat (moves to Nexus):**
- `setMessages`, `setChatPending`, `setActivityStream`, `setSessionId`, message pacing, streaming, abort, prior-message hydration.

**Workspace side effects (must move OUT of the chat hook):**
1. `setDetectedLens` — lens routing → move to a Nexus stream listener in workspace.
2. `setScenarioBuffer` — scenario capture → listener.
3. `setLeftTab` / `setMobileTab` — tab switching from chat events → listener.
4. `setPendingResolvedNodeIds` — flow node resolution → owned by FlowPanel via listener.
5. `setAutoNameKey` — project auto-name trigger → listener.
6. `onPreviewCode` — artifact → preview → owned by PreviewPanel via listener.
7. `onFlowNodes` — flow updates → owned by FlowPanel via listener.
8. `onStepEvent` — step progress → owned by StepProgress via listener.
9. `onDoneEvent` — done payload fan-out (imageGen, plans, etc.) → listener.
10. `setMemoryChips` — memory chip surfacing → listener.
11. Session bootstrap / `ensureSessionId` — keep, but wrap on top of Nexus.
12. Forge context, file context, plan events, artifact writes — listeners.

Anything not in the "pure chat" list stays in workspace code as **subscriptions to a shared event bus**, not as setters passed into the chat hook.

---

## Architecture after the swap

```text
WorkspacePage
  ├─ WorkspaceShell (header, tabs)
  ├─ WorkspacePanels (files, preview, ledger, flow, terminal, workbench, run cards)
  │     └─ each panel subscribes to workspaceEventBus for the events it cares about
  └─ WorkspaceConversationSurface
        └─ useNexusChatStream({ projectId, mode: "workspace", onEvent: bus.emit })
              └─ ChatStream + ChatComposer (already extracted)
```

One hook. One message stream. Workspace-specific reactions become bus listeners owned by the panel that actually renders them.

---

## Phases

### Phase 0 — Backend handoff (blocker for phase 2, not phase 1)

Hand off to Cursor:
- Add a `mode: "workspace" | "ask_atlas"` param to the Nexus chat endpoint (whatever `useNexusChatStream` POSTs to).
- When `mode === "workspace"`, compose system prompt with the workspace-context variant (project id, active files, active tab context, available workspace tools).
- Response shape unchanged. All existing signal lines (`NAVIGATE_TO`, `PROJECT_READY`, `MEMORY_CHIPS`, artifact JSON, step events) preserved.

Until this ships, phase 1 runs with the existing Nexus prompt — usable but not workspace-aware.

### Phase 1 — Frontend: dual-mount, no removal (safe)

1. Create `src/lib/workspaceEventBus.ts` — tiny typed emitter (`emit`, `on`, `off`).
2. Create `src/components/workspace/WorkspaceConversationSurface.tsx` that mounts `useNexusChatStream({ projectId, mode: "workspace" })` and renders `ChatStream` + `ChatComposer`.
3. Add a **feature flag** `USE_NEXUS_WORKSPACE_CHAT` (localStorage key). When on, workspace.tsx renders the new surface; when off, current `useChatStream` path is untouched.
4. Ship. User toggles the flag and compares speed/feel side by side.

No side effects are wired yet in phase 1. Chat works, run cards / preview / flow do not react to messages. This is intentional — proves the speed win first.

### Phase 2 — Frontend: migrate side effects, panel by panel

For each of the 12 side effects above, in this order (lowest risk first):
1. Preview artifact (`onPreviewCode`) → PreviewPanel subscribes.
2. Flow nodes (`onFlowNodes`, `setPendingResolvedNodeIds`) → FlowPanel subscribes.
3. Step events (`onStepEvent`) → StepProgress subscribes.
4. Memory chips (`setMemoryChips`) → AtlasMemoryHUD subscribes.
5. Lens / tab routing → workspace shell subscribes.
6. Done-event fan-out (imageGen, plans, auto-name) → each owner subscribes.

After each migration: verify parity, ship, move to next. Flag stays on for you, off for everyone else until phase 2 is done.

### Phase 3 — Delete `useChatStream` and dead workspace code

Only after phase 2 parity is proven. Removes ~1,100 lines and the 20+ setter props from workspace.tsx.

---

## What does NOT change

- Ask Atlas — untouched.
- Backend routes, streaming protocol, tool execution, run cards, Timeline, Changes, Ledger, prompts (except the workspace-mode variant in phase 0).
- Workspace shell, panels, tabs, files, preview, terminal, workbench, LiveGeneration, GitHub push, mockup sandbox.
- Any Zustand store (`shellStore`, `feederStore`).

---

## Real risks

1. **Nexus prompt is not workspace-aware.** Fixed by phase 0. Until then, workspace chat feels "smart but naive about the project." Acceptable in phase 1 because we're testing speed, not intelligence.
2. **Signal-line coverage.** Nexus already handles `NAVIGATE_TO`, `PROJECT_READY`, `MEMORY_CHIPS`. Workspace's `useChatStream` handles more (artifact JSON, step events, plan events). Those need explicit listener parity in phase 2 or panels silently break.
3. **Session model divergence.** `useChatStream` manages sessions differently than Nexus. `WorkspaceConversationSurface` needs a small session-bootstrap wrapper so existing sessions keep working.

---

## Deliverables per phase

- Phase 1: 2 new files (`workspaceEventBus.ts`, `WorkspaceConversationSurface.tsx`), ~30 lines added to `workspace.tsx` (flag branch), zero deletions.
- Phase 2: one PR per side effect, each < 100 lines.
- Phase 3: delete `useChatStream.ts`, prune ~500 lines from `workspace.tsx`.

---

## Next exact step

Approve this plan (or edit the phase order). On approval I execute **Phase 1 only** in one pass and ship it behind the flag. You test speed. We decide phase 2 after.
