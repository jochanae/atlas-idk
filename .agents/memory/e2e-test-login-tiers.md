---
name: E2E dev-test-login tier override
description: How to bypass the free-plan 1-project limit when writing e2e/Playwright tests that need to create more than one project.
---

`GET /api/auth/dev-test-login` (dev-only, 404s in production) creates a fresh throwaway user and session cookie for e2e tests. It accepts an optional `?tier=pro` query param that sets the new user's `subscriptionTier` to `"pro"` instead of the default `"free"`.

**Why:** the free plan is hard-limited to 1 project (`ProjectLimitReachedError` in `artifacts/api-server/src/lib/projectCreation.ts`). Test flows that need to create a second project (e.g. testing cross-project isolation, Ask Atlas contamination) hit an UpgradeModal on a plain free-tier `dev-test-login` account and can't proceed.

**How to apply:** when a test plan needs more than one project, log in via `GET /api/auth/dev-test-login?tier=pro` instead of the bare route. Still fully gated by `NODE_ENV === "production"` returning 404, so this has no production exposure.
