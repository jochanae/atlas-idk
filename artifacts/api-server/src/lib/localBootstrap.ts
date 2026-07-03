import fsPromises from "fs/promises";
import path from "path";
import { ensureProjectWorkspaceDir } from "./projectWorkspace";

export interface LocalBootstrapResult {
  dir: string;
  files: string[];
}

// ── Scaffold ──────────────────────────────────────────────────────────────────
// Uses .tsx entry points so Atlas-generated TypeScript files naturally replace
// them (instead of leaving old .jsx stubs that the build picks up instead).
// Includes Tailwind CSS + PostCSS since Atlas generates Tailwind UIs by default.
const SCAFFOLD: Record<string, string> = {
  "package.json": JSON.stringify(
    {
      name: "atlas-project",
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
      },
      dependencies: {
        react: "^18.2.0",
        "react-dom": "^18.2.0",
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.0.0",
        vite: "^5.0.0",
        typescript: "^5.0.0",
        tailwindcss: "^3.4.0",
        autoprefixer: "^10.4.0",
        postcss: "^8.4.0",
      },
    },
    null,
    2,
  ),

  "tsconfig.json": JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        useDefineForClassFields: true,
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx",
        strict: true,
      },
      include: ["src"],
    },
    null,
    2,
  ),

  "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    hmr: false,
  },
});
`,

  "postcss.config.js": `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,

  "tailwind.config.js": `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
`,

  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Atlas Project</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,

  "src/main.tsx": `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,

  "src/App.tsx": `export default function App() {
  return (
    <div className="app">
      <h1>Atlas Project</h1>
      <p>Start editing to build your app.</p>
    </div>
  );
}
`,

  "src/index.css": `@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, sans-serif;
  background: #fff;
  color: #111;
}

.app {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}
`,
};

export const BOOTSTRAP_FILES = Object.keys(SCAFFOLD);

/**
 * Write a React/Vite + TypeScript + Tailwind scaffold into a project's workspace
 * directory. Only writes scaffold files that DON'T already exist — so Atlas-generated
 * files written before bootstrap are never clobbered.
 * Returns the absolute workspace path and the relative paths of files written.
 */
export async function bootstrapLocalWorkspace(projectId: number): Promise<LocalBootstrapResult> {
  const dir = await ensureProjectWorkspaceDir(projectId);
  const files: string[] = [];

  for (const [relPath, content] of Object.entries(SCAFFOLD)) {
    const abs = path.join(dir, relPath);
    await fsPromises.mkdir(path.dirname(abs), { recursive: true });

    // Only write scaffold files that don't already exist.
    // If Atlas already wrote this file (e.g. src/App.tsx), keep Atlas's version.
    let exists = false;
    try { await fsPromises.access(abs); exists = true; } catch { /* not found */ }
    if (!exists) {
      await fsPromises.writeFile(abs, content, "utf-8");
      files.push(relPath);
    }
  }

  return { dir, files };
}
