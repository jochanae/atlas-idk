import type { RepositoryClassificationInput } from "../../types.js";

/**
 * Fixture F — Mixed monorepo: runnable web frontend + API needing Postgres + Expo package.
 *
 * Three packages. The Expo package is unsupported; the API requires DATABASE_URL
 * to boot; the frontend is immediately runnable.
 *
 * Expected:
 *   - repositoryType "monorepo"
 *   - overallStatus "ready" (derived from recommended frontend target, NOT from the
 *     worst-case target — this is the key assertion for the precedence algorithm)
 *   - recommendation.targetId points to the web frontend
 *   - Expo target → status "unsupported" (appears in warnings, does not override status)
 *   - API target → status "external-service-required" or "configuration-required"
 *   - Warning mentioning the Expo package
 */
export const fixtureMixedMonorepo: RepositoryClassificationInput = {
  repositoryRoot: "/workspace",
  sourceMode: "local-complete",
  files: [
    {
      path: "pnpm-workspace.yaml",
      content: `packages:\n  - 'apps/*'\n`,
    },
    {
      path: "package.json",
      content: JSON.stringify({
        name: "mixed-monorepo",
        private: true,
        scripts: {
          "dev:web": "pnpm --filter @workspace/web run dev",
        },
      }),
    },
    // Web frontend
    {
      path: "apps/web/package.json",
      content: JSON.stringify({
        name: "@workspace/web",
        private: true,
        scripts: { dev: "vite", build: "vite build" },
        dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
        devDependencies: { vite: "^5.4.8", "@vitejs/plugin-react": "^4.3.2" },
      }),
    },
    {
      path: "apps/web/vite.config.ts",
      content: `import { defineConfig } from 'vite';\nexport default defineConfig({});\n`,
    },
    {
      path: "apps/web/index.html",
      content: `<!doctype html><html><body><script type="module" src="/src/main.tsx"></script></body></html>`,
    },
    {
      path: "apps/web/src/main.tsx",
      content: `import { createRoot } from 'react-dom/client';\ncreateRoot(document.getElementById('root')!).render(<div />);\n`,
    },
    // API needing Postgres
    {
      path: "apps/api/package.json",
      content: JSON.stringify({
        name: "@workspace/api",
        private: true,
        scripts: { dev: "tsx src/index.ts", start: "node dist/index.js" },
        dependencies: { express: "^5", pg: "^8.11.0" },
      }),
    },
    {
      path: "apps/api/src/index.ts",
      content: `import express from 'express';\nimport { Pool } from 'pg';\nconst pool = new Pool({ connectionString: process.env.DATABASE_URL });\nconst app = express();\napp.listen(process.env.PORT ?? 3001);\n`,
    },
    {
      path: "apps/api/.env.example",
      content: `DATABASE_URL=postgresql://localhost:5432/mydb\n`,
    },
    // Mobile (Expo)
    {
      path: "apps/mobile/package.json",
      content: JSON.stringify({
        name: "@workspace/mobile",
        private: true,
        scripts: { start: "expo start", ios: "expo run:ios", android: "expo run:android" },
        dependencies: { expo: "~51.0.0", "react-native": "0.74.0" },
      }),
    },
    {
      path: "apps/mobile/app.json",
      content: JSON.stringify({
        expo: { name: "mobile", slug: "mobile", sdkVersion: "51.0.0" },
      }),
    },
    {
      path: "apps/mobile/app/index.tsx",
      content: `import { Text } from 'react-native';\nexport default function Home() { return <Text>Home</Text>; }\n`,
    },
  ],
};
