# Development Environments

This monorepo has one supported runtime/preview environment: **Replit + pnpm**.

## Package manager

- **pnpm** (workspace mode). `pnpm-workspace.yaml` uses the `catalog:` field to pin
  shared dependency versions (React 19.1.0, Vite 7.3.2, etc.) across every artifact
  and lib package.
- Do **not** convert `catalog:` references to literal versions. That would break the
  single-source-of-truth pinning the entire repo depends on.
- Do **not** switch package managers. `pnpm install` is the only supported install
  command.

## Runtime / preview

- **Replit** runs the artifacts via `pnpm --filter @workspace/<artifact> run dev`.
  Ports and base paths come from each artifact's `.replit-artifact/artifact.toml`.

## Lovable sandbox limitation

Lovable's preview sandbox runs `bun install`. Bun does not currently understand
pnpm workspace `catalog:` references, so `bun install` fails on this repo. This
is an environment incompatibility, not an application failure:

- Lovable **can** edit files, run typechecks against the code, and produce
  scaffolds against the shared contract.
- Lovable **cannot** run the monorepo preview through its bun sandbox.
- All actual preview/validation of frontend artifacts happens on Replit.

If Lovable reports "dev server did not become healthy" or "bun install failed:
typescript@catalog:", that is the same recurring symptom of this incompatibility
— not a regression introduced by any recent edit.

## Contract-first workflow

- `docs/RUN_LIFECYCLE_CONTRACT.md` (frozen at v1.2) is the human-readable authority.
- `lib/run-contract/src/index.ts` is the executable TypeScript both teams compile
  against.
- Frontend artifacts import types from `@workspace/run-contract` (workspace ref) or
  directly via the `@contract` path alias (see `artifacts/atlas-frontend-next/vite.config.ts`).

## Artifacts

| Artifact | Purpose | Port |
|---|---|---|
| `artifacts/atlas-frontend/` | Legacy frontend. Preserved until cutover. | 8080 |
| `artifacts/atlas-frontend-next/` | Phase 1 rebuild against the frozen contract. Mocked runtime. | 20250 |
| `artifacts/api-server/` | Backend (Replit-managed). | — |
| `artifacts/crm-benchmark/` | Reference/benchmark artifact. | 20234 |
| `artifacts/mockup-sandbox/` | Isolated mockup preview. | — |
