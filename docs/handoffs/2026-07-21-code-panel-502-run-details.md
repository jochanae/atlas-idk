# Code Panel 502 — Run Details Fetch Investigation

**Date:** 2026-07-21  
**Surface:** `/code` Generation Workspace (`artifacts/atlas-frontend/src/pages/code.tsx`)  
**Symptom:** Bottom error state **"Couldn't load this run"** with **502 Bad Gateway** (also observed as bare **500 Internal Server Error**)

## What the Code panel actually fetches

Not `/api/runs/:id`. The Code panel loads generation history via:

| Query | Endpoint |
|---|---|
| Project stub | `GET /api/projects/:projectId` |
| Run list | `GET /api/projects/:projectId/generation-runs` |
| Run files | `GET /api/projects/:projectId/generation-runs/:runId/files` |

Error UI is shared: any of `projectQ` / `runsQ` / `filesQ` failing surfaces `ErrorState` ("Couldn't load this run").

Handlers live in `artifacts/api-server/src/routes/generation.ts`. They are simple authenticated DB reads — they do **not** call GitHub, Anthropic, or Replit proxy execution.

## Live evidence (this session)

Probed from the Cursor cloud-agent pod at ~2026-07-21 13:02–13:04 UTC.

### Public hosts — `/api` broken at the edge

| URL | Result |
|---|---|
| `https://axiomsystem.app/` | **200** static HTML (CDN/`accept-ranges`, no Express) |
| `https://axiomsystem.app/api/health` | **500** plain `Internal Server Error` — `via: 1.1 google`, **no** `x-powered-by: Express` |
| `https://axiomsystem.app/api/capabilities` | **500** same |
| `https://axiomsystem.app/api/projects/1/generation-runs` | **500** same |
| `https://axiomatlas.replit.app/api/*` | **500** same pattern |
| First probe wave | Intermittent **502** body: `The deployment could not be reached` (Replit edge copy) |

Conclusion: the browser on `axiomsystem.app` never reaches a healthy Express process for `/api/*`. Static frontend is up; API path is dead/flapping at the platform edge.

### Direct Cloud Run backend — healthy

Service referenced by the deployed frontend error reporter:

`https://axiom-atlas-689827072865.us-east1.run.app`

| URL | Result |
|---|---|
| `GET /api/health` | **200** — `database/anthropic/github/stripe/gemini/openai` all `ok` |
| `GET /api/healthz` | **200** `{"status":"ok"}` |
| `GET /api/projects/1/generation-runs` | **401** `{"error":"Authentication required"}` (route live; Express headers present) |
| `GET /api/projects/1/generation-runs/foo/files` | **401** same |
| CORS preflight from `Origin: https://axiomsystem.app` | **204** with `access-control-allow-origin: https://axiomsystem.app` |

So the generation-runs handlers are deployed and responding on Cloud Run. The Code panel 502/500 is **not** an application exception inside those handlers.

## Root cause (current best explanation)

**Infrastructure / routing outage on the public domains' `/api` path**, not a logic bug in run serialization or GitHub token/repo binding.

1. Deployed frontend uses **same-origin** `/api/...` (bundle has no hardcoded Cloud Run API base).
2. Same-origin `/api` on `axiomsystem.app` / `axiomatlas.replit.app` fails at Google/Replit edge before Express.
3. The known-good Cloud Run revision answers health + generation-runs correctly.
4. Therefore Refresh in the Code panel cannot succeed until the public domain's API ingress points at a live process again.

GitHub token vs linked-repo binding is a **separate** product issue (push/commit path). It does not explain this load failure.

## Why we could not read "backend logs" from here

This Cursor cloud agent has:

- No Replit deployment log access
- No `gcloud` / Cloud Logging credentials
- No local Atlas API process / `DATABASE_URL` in the pod

So process stdout/stderr for the failing public ingress could not be tailed from this environment. The closest substitute is the edge vs direct-Cloud-Run probe matrix above.

## Ops next actions (founder / deploy owner)

1. **Confirm which service `axiomsystem.app/api` routes to** (custom domain → Cloud Run service/revision, or Replit Autoscale deployment). Path-split is likely: `/` static vs `/api` backend.
2. **Open that service's runtime logs** around Code-panel load time and look for:
   - container crash / OOM / failed listen
   - cold-start failures
   - bad `PORT` / `DATABASE_URL` on the revision the custom domain hits (note: direct Cloud Run URL is healthy — domain may point at a *different* revision)
3. **Bring public `/api` back** until:
   ```bash
   curl -sS https://axiomsystem.app/api/health
   # expect Express JSON with checks, not plain "Internal Server Error"
   ```
4. Temporary unblock (if cookies/CORS allow): point the deployed frontend `VITE_API_URL` at the healthy Cloud Run host (`https://axiom-atlas-689827072865.us-east1.run.app`). Prefer fixing domain routing instead.
5. After API is reachable, Retry in Code panel — no app redeploy required for this specific 502 if routing alone was wrong.

## Code hardening shipped with this handoff

`GET .../generation-runs` and `GET .../generation-runs/:runId/files` previously had **no try/catch**. A DB throw became an unhandled async rejection (no global Express error middleware in `app.ts`). Added structured `logger.error` + `500` JSON so future app-level failures are distinguishable from edge 502/500 and appear in process logs.

## Verification checklist after ops fix

- [ ] `curl https://axiomsystem.app/api/health` → Express JSON, not plain 500/502
- [ ] Logged-in browser: Network tab `GET /api/projects/<id>/generation-runs` → 200
- [ ] Code panel loads run list + files without "Couldn't load this run"
- [ ] (Optional) Confirm Cloud Run / Replit logs show `GET /projects/:id/generation-runs` with 200, not process exit
