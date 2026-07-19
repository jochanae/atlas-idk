# Atlas Rebuild Architecture Plan

**Status:** Draft / On Hold  
**Purpose:** Reference plan for a controlled rebuild if the team decides to move forward.  
**Scope:** Split Atlas between Lovable Cloud (primary platform) and a minimal external worker for capabilities Lovable Cloud cannot host.

---

## 1. Guiding principle

One owner for each responsibility. No more split-brain between Lovable, Cursor, and Replit. Lovable Cloud owns the product surface, data model, auth, chat, attachments, ledger, and workspace routing. Replit (or another Node host) becomes a **stateless worker** for heavy/long-running tasks only.

---

## 2. What lives on Lovable Cloud

| Capability | Owner | Notes |
|---|---|---|
| Auth (email, Google, Apple, password) | Lovable Cloud / Supabase Auth | Replace custom Express auth. Use built-in providers + RLS. |
| Database & schema | Lovable Cloud / Supabase | Conversations, messages, attachments, ledger, projects, runs. |
| Chat surface (Ask Atlas) | Lovable Cloud | Real-time or REST chat with streaming. |
| Workspace / Nexus surface | Lovable Cloud | Project-scoped chat, builder actions, run orchestration UI. |
| Attachments | Lovable Cloud | Storage bucket + `message_attachments` table. 60-day default retention. Library promotion. |
| Decision Ledger | Lovable Cloud | Core data model + UI. |
| Feature flags | Lovable Cloud | Supabase/Edge Function config or env flags. |
| WhisperGate / intent classification | Lovable Cloud | Edge Function or client-side classifier. |
| Run receipts & timeline | Lovable Cloud | Data + rendering. |
| Payments / billing | Lovable Cloud | Stripe or Paddle integration via Lovable connectors. |
| Static site / published app hosting | Lovable Cloud | Replaces `/share/:token` and `/p/:token` static serving. |

---

## 3. What lives on the external worker (Replit or equivalent)

| Capability | Owner | Notes |
|---|---|---|
| Heavy codegen / build runs | External worker | Long-running Node processes, file system codegen, project workspace builds. |
| Playwright / browser automation | External worker | Cannot run in Edge Functions due to duration + binary size. |
| Heavy document generation (PPTX, DOCX, PDF, ZIP) | External worker | Large binary processing, template rendering. |
| Source ingestion / ZIP extraction at scale | External worker | Large/untrusted file parsing. |
| Git Tree API pushes | External worker | Long-lived GitHub operations. |
| Any task > 30s or > 50MB | External worker | Edge Functions have hard limits. |

**Worker contract:** Lovable Cloud calls the worker over HTTPS with a signed job payload. The worker returns a job ID and streams progress to a Supabase realtime channel or webhook. The worker is stateless: it reads from Supabase Storage, writes results back, and never owns canonical data.

---

## 4. What carries over from `jochanae/atlas-idk`

- Product positioning and vocabulary (`POSITIONING.md`, memory files).
- UI/UX direction (bronze/slate palette, composer modes, DoubleVision, etc.).
- The concept of the Decision Ledger, Forge, WhisperGate, and Nexus.
- Frontend component patterns where they are clean and reusable.
- Zod/api-spec contracts where they are still accurate.

---

## 5. What dies in the rebuild

- Custom Express auth and session middleware.
- The 45+ hand-wired backend routes in `artifacts/api-server/src/routes/`.
- Custom Drizzle schema + migrations (replaced by Supabase-managed schema).
- The custom attachment pipeline and its kill switches.
- Replit Object Storage for primary file storage (use Supabase Storage).
- Background workers inside the monorepo (retention, indexing) — move to Edge Functions or scheduled SQL.
- Duplicate/shadowed capability routes.
- The current `__root.tsx` / router reload-on-focus behavior.

---

## 6. Suggested rebuild phases

### Phase 0: Archive
- Freeze current repo.
- Export database snapshot.
- Document current feature set and critical user flows.

### Phase 1: Spine
- Auth on Supabase.
- Conversation + message schema.
- Ask Atlas chat surface with streaming.
- Basic attachment upload/download (no library, no heavy processing).

### Phase 2: Workspace
- Project model.
- Nexus workspace surface.
- Decision Ledger.
- Run/job model with worker integration.

### Phase 3: Builder
- Forge → codegen worker.
- GitHub push worker.
- Live preview / published app hosting.

### Phase 4: Polish
- Library promotion.
- Advanced attachment processing.
- Mobile refinement.
- Migration of historical data.

---

## 7. Open decisions

1. **Auth provider:** Use the existing Supabase project already provisioned, or start fresh with Lovable Cloud auth?
2. **Worker host:** Keep Replit as the worker, or use Railway/Fly.io/Render for simpler ops?
3. **Data migration:** Migrate historical conversations/ledger, or start fresh and archive old data?
4. **Feature parity cutoff:** Which current features are must-haves in Phase 1 vs. later?
5. **Team split:** Who owns the worker code (Cursor/you) vs. Lovable Cloud code (Lovable)?

---

## 8. First step if resumed

Write a one-page "Phase 1 spec" that lists:
- Exact schema tables.
- Exact auth providers.
- Exact user flows that must work.
- Exact worker endpoints needed (likely zero for Phase 1).

Then start a fresh Lovable project and rebuild only Phase 1 before touching anything else.

---

*This plan is intentionally high-level. It should be refined into a detailed spec before any demolition or rebuild begins.*
