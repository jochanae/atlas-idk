---
name: One Engine Principle
description: Architectural governing principle for Atlas conversation surfaces — one engine, two views; how to name and scope the shared controller.
---

## The Principle

> There is only one Atlas conversation engine. Ask Atlas and Workspace are two views into it.

Established 2026-07-18 during Phase 1 audit of the Attachments Rebuild Directive.

## What this means in the current codebase

The Nexus engine (`nexus.ts`, `useNexusChatStream`, `nexus_messages`) is **already one shared layer**. Both surfaces call the same endpoint and write to the same table. The engine is not the problem.

The divergence is in how each surface **connects** to that engine:
- Ask Atlas: `useNexusChatStream.send({ text, attachments })` — correct
- Workspace: inline `handleSend` override in `workspace.tsx` calling `nexusBridge.send(text)` — bypasses attachments entirely

## The required fix

Create a **surface-neutral conversation controller** consumed by both surfaces. Acceptable names: `useAtlasConversation`, `useConversationController`, `useNexusConversation`.

**Why:** `useNexusWorkspaceBridge` already implies Workspace ownership. Turning a Workspace-specific abstraction into the universal engine recreates the same problem with a different name.

## The prohibited pattern

```typescript
// Any inline surface-owned send handler
const handleSend = () => {
  // surface-owned validation
  // surface-owned attachment prep
  // surface-owned transport call
};
```

This is the current Workspace pattern. It may not be patched and retained — it must be replaced.

## The required pattern

```typescript
const conversation = useAtlasConversation({
  surface: "workspace",
  conversationId,
  projectId,
  projectContext,
  mode,
});

<ChatComposer onSubmit={conversation.submit} />
```

## What surfaces may and may not do

**May provide:** surface, conversationId, projectId, mode, project context, tool availability, navigation callbacks.

**May not reimplement:** send eligibility, draft normalization, attachment readiness, client message ID, request construction, Nexus transport call, pending state, cancellation, retry, send errors.

## Sequencing rule

**Why:** Path B chosen — unify submission structure first, then rebuild attachments through it.

Checkpoint B1: unified text submission (inline override removed, both surfaces use same controller).
Checkpoint B2: shared staged attachments (attachments added to the already-unified path).

Rationale: patching attachment fields into the existing override would close today's image gap but preserve the exact mechanism that caused the divergence. Every future capability (documents, voice, sketches, tool approvals, retry metadata) would drift again.

## ComposerSubmission contract

```typescript
type ComposerSubmission = {
  text: string;
  stagedAttachments: StagedAttachment[];
};
```

The composer emits this shape. The controller converts it to the canonical Nexus request. The composer must not know about base64, provider blocks, Nexus request shapes, project DNA, database records, or signed URLs.
