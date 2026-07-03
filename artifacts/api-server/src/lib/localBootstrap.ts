import fsPromises from "fs/promises";
import path from "path";
import { ensureProjectWorkspaceDir } from "./projectWorkspace";

export interface LocalBootstrapResult {
  dir: string;
  files: string[];
}

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
      },
    },
    null,
    2,
  ),

  "vite.config.js": `import { defineConfig } from "vite";
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

  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Atlas Project</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,

  "src/main.jsx": `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,

  "src/App.jsx": `export default function App() {
  return (
    <div className="app">
      <h1>Atlas Project</h1>
      <p>Start editing to build your app.</p>
    </div>
  );
}
`,

  "src/App.css": `* {
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
 * Write a minimal React/Vite + plain CSS scaffold into a project's workspace
 * directory. Idempotent — safe to call if the directory already has files.
 * Returns the absolute workspace path and the relative paths of files written.
 */
export async function bootstrapLocalWorkspace(projectId: number): Promise<LocalBootstrapResult> {
  const dir = await ensureProjectWorkspaceDir(projectId);
  const files: string[] = [];

  for (const [relPath, content] of Object.entries(SCAFFOLD)) {
    const abs = path.join(dir, relPath);
    await fsPromises.mkdir(path.dirname(abs), { recursive: true });
    await fsPromises.writeFile(abs, content, "utf-8");
    files.push(relPath);
  }

  return { dir, files };
}
