---
name: Artifact Verification Engine (F6A)
description: Shared post-generation verification framework for generated artifacts (PPTX/DOCX/PDF/HTML so far) — retry policy, check contract, gotchas.
---

Verification runs inside `generateArtifact()` right after the ledger entry is linked (same choke point pattern used for HTML's `needs_review` status). It is a separate result (`metadata.verification`) from the existing generation `status` field — never overload `status`, since `useChatStream.ts` is the only frontend consumer of `needs_review` and does not expect a verification vocabulary.

**Retry policy:** `classifyFailure()` buckets failures into `transient` | `content-shape` | `permanent`. Only the first two retry, and only once (re-render + re-upload). Credentials/permissions/unsupported-format/deterministic-validation failures are `permanent` and never retried — retrying those just burns render calls for a guaranteed repeat failure.

**"Opens successfully" must mean real parsing**, not a signature check: PPTX/DOCX go through actual jszip OOXML package parsing (`verifiers/ooxmlUtils.ts`), PDF goes through real `pdf-parse` content extraction (not just an `%PDF-` header check).

**Truncation detection convention:** renderers declare `expectedCounts: { slides: n }` (plural key) on their `ArtifactRenderOutput`; renderer preview payloads use the singular form (`slideCount`), not `slidesCount`. The truncation check in `verificationEngine.ts` must singularize the expectedCounts key before matching it against preview fields, or the check silently no-ops.

**pdf-parse v2 vs v1:** v2 (`pdf-parse@2.x`) is pdfjs-dist-based with a class API (`PDFParse`) and no simple default export — do not use it for a quick buffer→text check. Use `pdf-parse@1.1.1` instead, and import from `pdf-parse/lib/pdf-parse.js` (not the package's `index.js` wrapper) — the wrapper has a `require.main === module` "debug mode" branch that misfires under bundlers/test runners and throws `ENOENT` trying to read a fixture file from disk.

Verification always runs against direct object-storage calls (`ObjectStorageService.getObjectEntityFile().exists()/.download()`), never the public HTTP download route — avoids an extra network hop and auth dependency for a check that should be infra-internal.
