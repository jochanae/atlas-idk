export type DetectedRoute = {
  method?: string;
  path: string;
  handler?: string;
  file: string;
  line: number;
};

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Per-project route scan across common frameworks.
 * Detects: React Router <Route>, TanStack file-based hints, Next app/pages,
 * Express verbs, Supabase Edge Functions.
 */
export function scanProjectRoutes(
  files: Array<{ path: string; content: string }>,
): DetectedRoute[] {
  const routes: DetectedRoute[] = [];

  for (const file of files) {
    const { path: filePath, content } = file;
    if (!content) continue;

    // React Router / Remix-style <Route path="...">
    for (const match of content.matchAll(/<Route\s+[^>]*\bpath\s*=\s*["']([^"']+)["'][^>]*>/g)) {
      const routePath = match[1]!;
      routes.push({
        path: routePath.startsWith("/") ? routePath : `/${routePath}`,
        handler: "Route",
        file: filePath,
        line: lineOf(content, match.index ?? 0),
      });
    }

    // createBrowserRouter / createHashRouter children path: "..."
    for (const match of content.matchAll(/\bpath\s*:\s*["']([^"']+)["']/g)) {
      if (!/\.(tsx?|jsx?)$/.test(filePath)) continue;
      // Heuristic: only in files that look like router config
      if (!/create(?:Browser|Hash|Memory)?Router|RouteObject|children\s*:/.test(content)) continue;
      const routePath = match[1]!;
      routes.push({
        path: routePath.startsWith("/") || routePath === "" ? routePath || "/" : `/${routePath}`,
        handler: "router",
        file: filePath,
        line: lineOf(content, match.index ?? 0),
      });
    }

    // Express / Fastify-style app.get/post/...
    for (const match of content.matchAll(
      /\b(?:app|router|server)\.(get|post|put|patch|delete|options|head|all)\s*\(\s*["'`]([^"'`]+)["'`]/g,
    )) {
      routes.push({
        method: match[1]!.toUpperCase(),
        path: match[2]!,
        handler: `${match[1]}`,
        file: filePath,
        line: lineOf(content, match.index ?? 0),
      });
    }

    // Next.js app router: app/**/page.tsx → route from folder
    if (/(^|\/)app\/.+\/page\.(tsx?|jsx?)$/.test(filePath) || /(^|\/)app\/page\.(tsx?|jsx?)$/.test(filePath)) {
      const rel = filePath.replace(/^.*?\/app\//, "").replace(/\/page\.(tsx?|jsx?)$/, "");
      const routePath =
        rel === "page" || rel === ""
          ? "/"
          : "/" +
            rel
              .split("/")
              .filter((s) => s !== "page")
              .map((s) => s.replace(/^\[(\.\.\.)?(.+)\]$/, (_m, dots, name) => (dots ? `*${name}` : `:${name}`)))
              .join("/");
      routes.push({ path: routePath || "/", handler: "next-app", file: filePath, line: 1 });
    }

    // Next.js pages router
    if (/(^|\/)pages\/.+\.(tsx?|jsx?)$/.test(filePath) && !filePath.includes("/api/")) {
      const rel = filePath
        .replace(/^.*?\/pages\//, "")
        .replace(/\.(tsx?|jsx?)$/, "")
        .replace(/\/index$/, "");
      if (rel.startsWith("_")) continue;
      const routePath =
        "/" +
        rel
          .split("/")
          .map((s) => s.replace(/^\[(\.\.\.)?(.+)\]$/, (_m, dots, name) => (dots ? `*${name}` : `:${name}`)))
          .join("/");
      routes.push({
        path: routePath === "/index" ? "/" : routePath,
        handler: "next-pages",
        file: filePath,
        line: 1,
      });
    }

    // Next.js API routes under pages/api
    if (/(^|\/)pages\/api\/.+\.(tsx?|jsx?|ts|js)$/.test(filePath)) {
      const rel = filePath
        .replace(/^.*?\/pages\/api\//, "")
        .replace(/\.(tsx?|jsx?|ts|js)$/, "")
        .replace(/\/index$/, "");
      routes.push({
        method: "ALL",
        path: `/api/${rel}`,
        handler: "next-api",
        file: filePath,
        line: 1,
      });
    }

    // Supabase Edge Functions
    if (/supabase\/functions\/[^/]+\/index\.(ts|js)$/.test(filePath)) {
      const name = filePath.match(/supabase\/functions\/([^/]+)\//)?.[1];
      if (name) {
        routes.push({
          method: "POST",
          path: `/functions/v1/${name}`,
          handler: "supabase-edge",
          file: filePath,
          line: 1,
        });
      }
    }

    // TanStack Router file-based: routes/**/*.tsx with createFileRoute
    if (/createFileRoute\s*\(/.test(content)) {
      for (const match of content.matchAll(/createFileRoute\s*\(\s*["']([^"']+)["']/g)) {
        routes.push({
          path: match[1]!,
          handler: "tanstack-file",
          file: filePath,
          line: lineOf(content, match.index ?? 0),
        });
      }
    }
  }

  // Dedupe by method+path+file+line
  const seen = new Set<string>();
  return routes.filter((r) => {
    const key = `${r.method ?? ""}|${r.path}|${r.file}|${r.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
