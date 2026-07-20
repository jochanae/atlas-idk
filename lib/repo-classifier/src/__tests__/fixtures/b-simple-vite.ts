import type { RepositoryClassificationInput } from "../../types.js";

/**
 * Fixture B — Simple single-package Vite + React app.
 *
 * One package.json at the root, vite.config.ts, index.html, src/main.tsx.
 * No backend, no env vars, no external services.
 * Expected: overallStatus "ready", confidence "high", one frontend target.
 */
export const fixtureSimpleVite: RepositoryClassificationInput = {
  repositoryRoot: "/workspace",
  sourceMode: "local-complete",
  files: [
    {
      path: "package.json",
      content: JSON.stringify({
        name: "my-app",
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
        },
      }),
    },
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n`,
    },
    {
      path: "index.html",
      content: `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`,
    },
    {
      path: "src/main.tsx",
      content: `import { createRoot } from 'react-dom/client';\ncreateRoot(document.getElementById('root')!).render(<div>Hello</div>);\n`,
    },
    {
      path: "src/App.tsx",
      content: `export default function App() { return <div>App</div>; }\n`,
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify({ compilerOptions: { target: "ES2020", jsx: "react-jsx" } }),
    },
  ],
};
