import type { RepositoryClassificationInput } from "../../types.js";

/**
 * Fixture A — Atlas's own monorepo.
 *
 * The hardest case: a pnpm monorepo with two real runnable targets
 * (atlas-frontend + api-server), several lib packages that are NOT runnable
 * targets, and a scripts package. The classifier must surface both app targets,
 * detect DATABASE_URL + SESSION_SECRET as boot-required secrets, detect
 * RESEND_API_KEY as feature-required, and detect PostgreSQL as an external
 * service. It must NOT label the repo as "unsupported" or "Tier 4".
 */
export const fixtureAtlasMonorepo: RepositoryClassificationInput = {
  repositoryRoot: "/workspace",
  sourceMode: "local-complete",
  files: [
    {
      path: "pnpm-workspace.yaml",
      content: `packages:\n  - 'artifacts/*'\n  - 'lib/*'\n  - 'lib/integrations/*'\n  - 'scripts'\n`,
    },
    {
      path: "package.json",
      content: JSON.stringify({
        name: "axiom-monorepo",
        private: true,
        scripts: {
          dev: "pnpm --filter @workspace/api-server run dev & pnpm --filter @workspace/atlas-frontend run dev",
          typecheck: "tsc --build && pnpm -r --filter '!@workspace/db' run typecheck",
          build: "pnpm run typecheck && pnpm -r run build",
        },
      }),
    },
    {
      path: "artifacts/atlas-frontend/package.json",
      content: JSON.stringify({
        name: "@workspace/atlas-frontend",
        private: true,
        scripts: {
          dev: "vite",
          build: "tsc && vite build",
          preview: "vite preview",
        },
        dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
        devDependencies: {
          "@vitejs/plugin-react": "^4.3.2",
          vite: "^5.4.8",
          typescript: "^5.5.3",
          tailwindcss: "^3.4.14",
        },
      }),
    },
    {
      path: "artifacts/atlas-frontend/vite.config.ts",
      content: `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n`,
    },
    {
      path: "artifacts/atlas-frontend/index.html",
      content: `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`,
    },
    {
      path: "artifacts/atlas-frontend/src/main.tsx",
      content: `import { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<App />);\n`,
    },
    {
      path: "artifacts/api-server/package.json",
      content: JSON.stringify({
        name: "@workspace/api-server",
        private: true,
        type: "module",
        scripts: {
          dev: "export NODE_ENV=development && pnpm run build && pnpm run start",
          build: "node ./build.mjs",
          start: "node --enable-source-maps ./dist/index.mjs",
        },
        dependencies: {
          express: "^5",
          "drizzle-orm": "^0.30.0",
          pg: "^8.11.0",
          pino: "^9",
          zod: "^3.23.0",
          "@workspace/db": "workspace:*",
        },
      }),
    },
    {
      path: "artifacts/api-server/src/index.ts",
      content: `import express from 'express';\nconst app = express();\nconst PORT = process.env.PORT ?? 8080;\napp.listen(PORT);\n`,
    },
    {
      path: "artifacts/api-server/.env.example",
      content: `DATABASE_URL=postgresql://localhost:5432/axiom\nSESSION_SECRET=change-me-in-production\nRESEND_API_KEY=re_...\n`,
    },
    {
      path: "lib/db/package.json",
      content: JSON.stringify({
        name: "@workspace/db",
        scripts: { build: "tsc --build" },
        dependencies: { "drizzle-orm": "^0.30.0", pg: "^8.11.0" },
      }),
    },
    {
      path: "lib/run-contract/package.json",
      content: JSON.stringify({
        name: "@workspace/run-contract",
        scripts: { build: "tsc --build" },
      }),
    },
    {
      path: "scripts/package.json",
      content: JSON.stringify({
        name: "@workspace/scripts",
        scripts: { "seed-db": "tsx src/seed.ts" },
      }),
    },
  ],
};
