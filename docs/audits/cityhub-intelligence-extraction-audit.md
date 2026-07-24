# CityHub — Project Intelligence Extraction Audit

**Date:** 2026-07-24  
**Scope:** Open Questions + Major Decisions grounding, dedupe, resolution, provenance  
**Fix:** `intelligenceExtractionNormalize.ts` + `genomeExtract.ts` + intelligence/Insights surfaces

## Finding

CityHub DNA/manifest was mostly grounded, but Open Questions and Major Decisions were not fully reliable.

### Correctly extracted
- Editorial identity remains unresolved
- Primary audience is local entrepreneurs
- Guest referrals are the lead distribution strategy
- Explicit pilot-to-weekly success thresholds remain undefined

### Incorrect / unsupported (dropped)
- replication model for other cities
- geographic expansion structure
- post-launch replication model  

These were Atlas speculative suggestions, not PERSON-raised questions. They also appeared as near-duplicates and are now collapsed + rejected unless PERSON adopts expansion.

### Partially resolved
- “Guest sourcing and booking pipeline” was too broad once counts/timing existed.  
  Residual now: prospect list, outreach message, follow-up cadence, booking workflow (`resolution: partial`).

### Cross-project contamination
- “Move Pricing after Journey Ahead slide” is not in the CityHub thread.  
  Rejected as `cross_project_signal` at extract time; filtered from Major Decisions when auto/atlas-sourced.

## Expected behavior (now enforced)

1. Extract only questions/decisions supported by the current project’s sources  
2. Deduplicate semantically equivalent questions (incl. expansion family)  
3. Distinguish open / partial / resolved  
4. Do not promote Atlas speculative suggestions into confirmed direction  
5. Do not admit decisions from other projects/conversations  
6. Preserve provenance (`sourceRole`, `sourceExcerpt`, `sourceMessageId`) on questions and decisions  

## Tests

`artifacts/api-server/src/lib/__tests__/intelligenceExtractionNormalize.test.ts` encodes the CityHub fixture above without calling the LLM.
