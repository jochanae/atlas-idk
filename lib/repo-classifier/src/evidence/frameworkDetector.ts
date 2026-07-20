import type { RepositoryFile, EvidenceItem, RunnableTarget } from "../types.js";
import type { WorkspacePackage } from "./workspaceDiscovery.js";

export type FrameworkResult = {
  framework: string;
  role: RunnableTarget["role"];
  confidence: "high" | "medium" | "low";
  evidence: EvidenceItem[];
  isMobile: boolean;
  isLibraryOnly: boolean;
  /**
   * For Vite apps: the script src path declared in index.html.
   * Used by the entry-point checker.
   */
  indexHtmlEntryRef?: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function hasDep(pkg: WorkspacePackage, name: string): boolean {
  const deps = {
    ...(pkg.packageJson.dependencies as Record<string, unknown> | undefined ?? {}),
    ...(pkg.packageJson.devDependencies as Record<string, unknown> | undefined ?? {}),
    ...(pkg.packageJson.peerDependencies as Record<string, unknown> | undefined ?? {}),
  };
  return name in deps;
}

function fileExists(pkg: WorkspacePackage, relativePath: string): boolean {
  const prefix = pkg.directory ? pkg.directory + "/" : "";
  const fullPath = prefix + relativePath;
  return pkg.ownedFiles.some((f) => f.path === fullPath);
}

function getFile(pkg: WorkspacePackage, relativePath: string): RepositoryFile | undefined {
  const prefix = pkg.directory ? pkg.directory + "/" : "";
  const fullPath = prefix + relativePath;
  return pkg.ownedFiles.find((f) => f.path === fullPath);
}

function hasFileMatching(pkg: WorkspacePackage, pattern: RegExp): boolean {
  return pkg.ownedFiles.some((f) => {
    const rel = pkg.directory ? f.path.slice(pkg.directory.length + 1) : f.path;
    return pattern.test(rel);
  });
}

/** Extract the script src from an index.html entry point reference, e.g. "/src/main.tsx" → "src/main.tsx" */
function parseIndexHtmlEntry(content: string): string | undefined {
  const m = content.match(/type=["']module["'][^>]+src=["']([^"']+)["']/);
  if (!m) return undefined;
  return m[1].replace(/^\//, ""); // strip leading slash
}

// ── Detection ──────────────────────────────────────────────────────────────────

export function detectFramework(pkg: WorkspacePackage): FrameworkResult {
  const evidence: EvidenceItem[] = [];

  // ── Mobile / Expo ──────────────────────────────────────────────────────────
  const hasExpo = hasDep(pkg, "expo") || hasDep(pkg, "expo-router");
  const hasReactNative = hasDep(pkg, "react-native");
  const hasAppJson = fileExists(pkg, "app.json");
  const appJsonFile = getFile(pkg, "app.json");
  const appJsonHasExpoKey =
    appJsonFile?.content
      ? /"expo"\s*:/.test(appJsonFile.content)
      : false;

  if (hasExpo || (hasReactNative && appJsonHasExpoKey)) {
    if (hasExpo) {
      evidence.push({ type: "detected", description: "expo dependency present", source: "package.json" });
    }
    if (appJsonHasExpoKey) {
      evidence.push({ type: "detected", description: "app.json contains expo configuration", source: "app.json" });
    }
    return { framework: "Expo / React Native", role: "unknown", confidence: "high", evidence, isMobile: true, isLibraryOnly: false };
  }

  // ── Next.js ────────────────────────────────────────────────────────────────
  if (hasDep(pkg, "next") || hasFileMatching(pkg, /^next\.config\.(js|ts|mjs|cjs)$/)) {
    const configFile = pkg.ownedFiles.find((f) => {
      const rel = pkg.directory ? f.path.slice(pkg.directory.length + 1) : f.path;
      return /^next\.config\.(js|ts|mjs|cjs)$/.test(rel);
    });
    if (configFile) {
      evidence.push({ type: "detected", description: "next.config file present", source: configFile.path });
    } else {
      evidence.push({ type: "detected", description: "next dependency present", source: "package.json" });
    }
    // Next.js is fullstack when it has API routes
    const hasApiRoutes = hasFileMatching(pkg, /^(?:src\/)?pages\/api\//) ||
      hasFileMatching(pkg, /^(?:src\/)?app\/api\//);
    const hasPrisma = hasDep(pkg, "@prisma/client") || hasDep(pkg, "prisma");
    const role: RunnableTarget["role"] = (hasApiRoutes || hasPrisma) ? "fullstack" : "fullstack";
    return { framework: "Next.js", role, confidence: "high", evidence, isMobile: false, isLibraryOnly: false };
  }

  // ── Vite ───────────────────────────────────────────────────────────────────
  const viteConfigFile = pkg.ownedFiles.find((f) => {
    const rel = pkg.directory ? f.path.slice(pkg.directory.length + 1) : f.path;
    return /^vite\.config\.(js|ts|mjs|cjs)$/.test(rel);
  });
  if (viteConfigFile || hasDep(pkg, "vite")) {
    if (viteConfigFile) {
      evidence.push({ type: "detected", description: "vite.config file present", source: viteConfigFile.path });
    } else {
      evidence.push({ type: "detected", description: "vite dependency present", source: "package.json" });
    }
    // Determine frontend stack
    const hasReact = hasDep(pkg, "react") || hasDep(pkg, "@vitejs/plugin-react");
    const hasVue = hasDep(pkg, "vue") || hasDep(pkg, "@vitejs/plugin-vue");
    const hasSvelte = hasDep(pkg, "svelte") || hasDep(pkg, "@sveltejs/vite-plugin-svelte");
    const stack = hasReact ? "React" : hasVue ? "Vue" : hasSvelte ? "Svelte" : "";
    const framework = stack ? `Vite + ${stack}` : "Vite";

    // Parse index.html entry ref
    const indexHtmlFile = getFile(pkg, "index.html");
    let indexHtmlEntryRef: string | undefined;
    if (indexHtmlFile?.content) {
      indexHtmlEntryRef = parseIndexHtmlEntry(indexHtmlFile.content);
      if (indexHtmlEntryRef) {
        evidence.push({ type: "detected", description: "index.html entry point declared", source: indexHtmlFile.path });
      }
    }

    return { framework, role: "frontend", confidence: "high", evidence, isMobile: false, isLibraryOnly: false, indexHtmlEntryRef };
  }

  // ── Express / Node server ──────────────────────────────────────────────────
  if (hasDep(pkg, "express") || hasDep(pkg, "fastify") || hasDep(pkg, "koa") || hasDep(pkg, "hono")) {
    const server = hasDep(pkg, "fastify") ? "Fastify" :
                   hasDep(pkg, "koa") ? "Koa" :
                   hasDep(pkg, "hono") ? "Hono" : "Express";
    evidence.push({ type: "detected", description: `${server} dependency present`, source: "package.json" });
    return { framework: `Node/${server}`, role: "api", confidence: "high", evidence, isMobile: false, isLibraryOnly: false };
  }

  // ── Pure library / tooling (no runnable server) ───────────────────────────
  const hasOnlyBuildScript = (() => {
    const scripts = (pkg.packageJson.scripts as Record<string, unknown> | undefined) ?? {};
    const keys = Object.keys(scripts);
    return keys.length > 0 && keys.every((k) => ["build", "typecheck", "test", "lint", "prepublish", "prepare"].includes(k));
  })();

  if (hasOnlyBuildScript) {
    evidence.push({ type: "inferred", description: "package has only build/test scripts, no runnable server", source: "package.json#scripts" });
    return { framework: "unknown", role: "unknown", confidence: "low", evidence, isMobile: false, isLibraryOnly: true };
  }

  // ── Unknown ────────────────────────────────────────────────────────────────
  evidence.push({ type: "failed-verification", description: "no recognized framework detected", source: "package.json" });
  return { framework: "unknown", role: "unknown", confidence: "low", evidence, isMobile: false, isLibraryOnly: false };
}

/**
 * Check whether a Vite app's declared index.html entry file exists.
 * Returns true if the entry exists, false if missing (strong inactive signal).
 */
export function checkEntryPointExists(pkg: WorkspacePackage, entryRef: string): boolean {
  return fileExists(pkg, entryRef);
}
