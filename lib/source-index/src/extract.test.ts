import { describe, expect, it } from "vitest";
import {
  extractExports,
  extractImportSpecifiers,
  resolveImport,
  extractAndResolveImports,
} from "./extract";
import { chunkText } from "./chunk";
import { buildFileTree } from "./walk";
import { scanProjectRoutes } from "./routes";

describe("extractExports", () => {
  it("extracts named function/const/type exports with lines", () => {
    const src = [
      "export function useAuth() {}",
      "export const API_URL = 'x'",
      "export type User = { id: string }",
      "export { helper as util }",
    ].join("\n");
    const exports = extractExports(src);
    expect(exports.find((e) => e.name === "useAuth")?.kind).toBe("function");
    expect(exports.find((e) => e.name === "useAuth")?.line).toBe(1);
    expect(exports.find((e) => e.name === "API_URL")?.kind).toBe("const");
    expect(exports.find((e) => e.name === "User")?.kind).toBe("type");
    expect(exports.find((e) => e.name === "util")?.kind).toBe("named");
  });
});

describe("resolveImport", () => {
  it("resolves relative and @/ aliases", () => {
    const known = new Set(["src/hooks/useAuth.ts", "src/lib/api.ts"]);
    expect(
      resolveImport("src/pages/Home.tsx", "../hooks/useAuth", {
        root: "/",
        knownFiles: known,
        aliases: { "@/": "src/" },
      }),
    ).toBe("src/hooks/useAuth.ts");
    expect(
      resolveImport("src/pages/Home.tsx", "@/lib/api", {
        root: "/",
        knownFiles: known,
        aliases: { "@/": "src/" },
      }),
    ).toBe("src/lib/api.ts");
    expect(
      resolveImport("src/pages/Home.tsx", "react", {
        root: "/",
        knownFiles: known,
      }),
    ).toBeNull();
  });
});

describe("extractAndResolveImports", () => {
  it("captures line numbers", () => {
    const src = `import { useAuth } from "@/hooks/useAuth";\nimport React from "react";`;
    const known = new Set(["src/hooks/useAuth.ts"]);
    const imports = extractAndResolveImports(src, "src/App.tsx", {
      root: "/",
      knownFiles: known,
      aliases: { "@/": "src/" },
    });
    expect(imports[0]?.resolvedPath).toBe("src/hooks/useAuth.ts");
    expect(imports[0]?.line).toBe(1);
    expect(imports[1]?.resolvedPath).toBeNull();
  });
});

describe("chunkText", () => {
  it("windows with overlap", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");
    const chunks = chunkText(lines, { windowLines: 40, overlapLines: 10 });
    expect(chunks[0]?.lineStart).toBe(1);
    expect(chunks[0]?.lineEnd).toBe(40);
    expect(chunks[1]?.lineStart).toBe(31);
  });
});

describe("buildFileTree", () => {
  it("nests paths", () => {
    const tree = buildFileTree([
      { path: "src/a.ts", sizeBytes: 10, language: "ts" },
      { path: "src/b/c.ts", sizeBytes: 20, language: "ts" },
    ]);
    expect(tree[0]?.name).toBe("src");
    expect(tree[0]?.children?.length).toBe(2);
  });
});

describe("scanProjectRoutes", () => {
  it("finds React Router and Express routes", () => {
    const routes = scanProjectRoutes([
      {
        path: "src/App.tsx",
        content: `<Route path="/login" element={<Login />} />\n<Route path="/dashboard" element={<Dash />} />`,
      },
      {
        path: "server/index.ts",
        content: `app.get("/api/health", handler);\nrouter.post('/api/users', createUser);`,
      },
    ]);
    expect(routes.some((r) => r.path === "/login")).toBe(true);
    expect(routes.some((r) => r.method === "GET" && r.path === "/api/health")).toBe(true);
  });
});

describe("extractImportSpecifiers", () => {
  it("includes dynamic imports", () => {
    const specs = extractImportSpecifiers(`const m = import("./lazy");`);
    expect(specs[0]?.specifier).toBe("./lazy");
  });
});
