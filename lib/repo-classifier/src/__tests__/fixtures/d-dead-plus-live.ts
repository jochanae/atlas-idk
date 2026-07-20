import type { RepositoryClassificationInput } from "../../types.js";

/**
 * Fixture D — Dead legacy frontend alongside active v2 frontend.
 *
 * apps/frontend-v2: active Vite app, entry point exists, runnable script present.
 * apps/frontend-legacy: start script references a missing entry point file
 *   (src/index.tsx does not exist in the file list), strong inactive signal.
 *
 * Expected:
 *   - frontend-v2 → status "likely-runnable", is recommendedTargetId
 *   - frontend-legacy → status "likely-inactive", inactivityReasons populated
 *   - overallStatus "ready" (derived from recommended target)
 */
export const fixtureDeadPlusLive: RepositoryClassificationInput = {
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
        name: "monorepo",
        private: true,
        scripts: {
          dev: "pnpm --filter @workspace/frontend-v2 run dev",
        },
      }),
    },
    {
      path: "apps/frontend-v2/package.json",
      content: JSON.stringify({
        name: "@workspace/frontend-v2",
        private: true,
        scripts: { dev: "vite", build: "vite build" },
        dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
        devDependencies: { vite: "^5.4.8", "@vitejs/plugin-react": "^4.3.2" },
      }),
    },
    {
      path: "apps/frontend-v2/vite.config.ts",
      content: `import { defineConfig } from 'vite';\nexport default defineConfig({});\n`,
    },
    {
      path: "apps/frontend-v2/index.html",
      content: `<!doctype html><html><body><script type="module" src="/src/main.tsx"></script></body></html>`,
    },
    {
      path: "apps/frontend-v2/src/main.tsx",
      content: `import { createRoot } from 'react-dom/client';\ncreateRoot(document.getElementById('root')!).render(<div />);\n`,
    },
    {
      path: "apps/frontend-legacy/package.json",
      content: JSON.stringify({
        name: "@workspace/frontend-legacy",
        private: true,
        scripts: {
          dev: "vite",
          build: "vite build",
        },
        dependencies: { react: "^17.0.2" },
        devDependencies: { vite: "^3.0.0" },
      }),
    },
    {
      path: "apps/frontend-legacy/vite.config.js",
      content: `import { defineConfig } from 'vite';\nexport default defineConfig({});\n`,
    },
    // Deliberately NOT including apps/frontend-legacy/src/index.tsx
    // so the classifier detects a missing entry point.
    {
      path: "apps/frontend-legacy/index.html",
      content: `<!doctype html><html><body><script type="module" src="/src/index.tsx"></script></body></html>`,
    },
  ],
};
