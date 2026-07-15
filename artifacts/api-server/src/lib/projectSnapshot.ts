/**
 * Project State Snapshot v1 (Engineering Fluency v0.1)
 *
 * Extracts the operational state of a project workspace once per session,
 * caches it for 30 minutes, and serves it to Atlas at turn entry — eliminating
 * repetitive package.json reads and stack-orientation tool calls.
 *
 * Sources read (all gracefully skipped if absent):
 *   package.json        — package manager, framework, key deps
 *   pnpm-workspace.yaml — monorepo confirmation
 *   artifact.toml       — service ports and paths
 *   git                 — branch, HEAD SHA, dirty flag, last commit
 *   project_builds DB   — last build result and error summary
 *
 * Each StackFact carries a source and confidence level so Atlas can distinguish
 * "confirmed by direct read" from "inferred from file presence."
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StackFact {
  key: string;
  value: string;
  /** Which file or field was read to derive this. */
  source: string;
  /** confirmed = directly read from file; inferred = derived from file presence / lock file */
  confidence: "confirmed" | "inferred";
}

export interface ServiceConfig {
  name: string;
  localPort: number;
  path: string;
}

export interface ProjectSnapshot {
  projectId: number;
  generatedAt: string;         // ISO 8601

  git: {
    branch: string | null;
    headSha: string | null;    // short 7-char SHA
    dirty: boolean | null;     // uncommitted changes present
    lastCommitMessage: string | null;
    lastCommitAge: string | null;  // e.g. "2 hours ago"
  };

  stack: StackFact[];          // tech stack facts in discovery order

  services: ServiceConfig[];   // from artifact.toml / .replit-artifact/

  buildState: {
    lastResult: "success" | "failure" | "unknown";
    lastAt: string | null;
    errorSummary: string | null;
  };

  /** Things the snapshot tried but could not determine. */
  openQuestions: string[];

  /** fresh = just computed this call; cached = served from in-process cache */
  freshness: "fresh" | "cached";
}

// ---------------------------------------------------------------------------
// In-process TTL cache
// ---------------------------------------------------------------------------

const SNAPSHOT_TTL_MS = 30 * 60 * 1000;  // 30 minutes

interface CacheEntry { snapshot: ProjectSnapshot; expiresAt: number }
const cache = new Map<number, CacheEntry>();

/** Force-expire a project's snapshot (call after builds or commits). */
export function invalidateProjectSnapshot(projectId: number): void {
  cache.delete(projectId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Spawn a command, return trimmed stdout or null on error / timeout. */
async function spawnLine(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs = 2_500,
): Promise<string | null> {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { cwd, shell: false });
    let out = "";
    child.stdout.on("data", (c: Buffer) => { out += c.toString(); });
    child.on("close", code => resolve(code === 0 ? out.trim() : null));
    child.on("error", () => resolve(null));
    const t = setTimeout(() => { try { child.kill(); } catch {} resolve(null); }, timeoutMs);
    child.on("close", () => clearTimeout(t));
  });
}

/** Try to read + JSON.parse a file; returns null if missing or unparseable. */
async function readJson(filePath: string): Promise<Record<string, any> | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Git state
// ---------------------------------------------------------------------------

async function extractGitState(workspaceDir: string): Promise<ProjectSnapshot["git"]> {
  const [branch, sha, statusOut, logOut] = await Promise.all([
    spawnLine("git", ["branch", "--show-current"], workspaceDir),
    spawnLine("git", ["rev-parse", "--short", "HEAD"], workspaceDir),
    spawnLine("git", ["status", "--short"], workspaceDir),
    spawnLine("git", ["log", "-1", "--format=%s\x1f%ar"], workspaceDir),
  ]);

  const [lastMsg, lastAge] = logOut ? logOut.split("\x1f") : [null, null];

  return {
    branch: branch ?? null,
    headSha: sha ?? null,
    dirty: statusOut !== null ? statusOut.length > 0 : null,
    lastCommitMessage: lastMsg?.trim() || null,
    lastCommitAge: lastAge?.trim() || null,
  };
}

// ---------------------------------------------------------------------------
// Stack facts from package.json
// ---------------------------------------------------------------------------

function parseDeps(pkg: Record<string, any>): Record<string, string> {
  return {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
    ...(pkg.peerDependencies ?? {}),
  };
}

function detectVersion(raw: string | undefined): string {
  return raw ? raw.replace(/^[\^~>=<]/, "") : "";
}

async function extractStackFacts(workspaceDir: string): Promise<{
  facts: StackFact[];
  questions: string[];
}> {
  const facts: StackFact[] = [];
  const questions: string[] = [];

  // ── package.json ──────────────────────────────────────────────────────────
  const pkg = await readJson(path.join(workspaceDir, "package.json"));

  if (pkg) {
    // Explicit package manager field (e.g. "pnpm@9.0.0")
    if (pkg.packageManager) {
      const [pm, ver] = String(pkg.packageManager).split("@");
      facts.push({
        key: "packageManager",
        value: ver ? `${pm} ${ver}` : pm,
        source: "package.json#packageManager",
        confidence: "confirmed",
      });
    }

    // Workspaces
    if (pkg.workspaces) {
      facts.push({
        key: "monorepo",
        value: Array.isArray(pkg.workspaces) ? "npm workspaces" : "workspaces config",
        source: "package.json#workspaces",
        confidence: "confirmed",
      });
    }

    const deps = parseDeps(pkg);

    // Frontend framework
    if (deps["next"]) {
      facts.push({ key: "frontend", value: `Next.js ${detectVersion(deps["next"])}`.trim(), source: "package.json#dependencies.next", confidence: "confirmed" });
    } else if (deps["react"] && deps["vite"]) {
      facts.push({ key: "frontend", value: "React + Vite", source: "package.json#dependencies", confidence: "confirmed" });
    } else if (deps["react"]) {
      facts.push({ key: "frontend", value: `React ${detectVersion(deps["react"])}`.trim(), source: "package.json#dependencies.react", confidence: "confirmed" });
    } else if (deps["vue"]) {
      facts.push({ key: "frontend", value: `Vue ${detectVersion(deps["vue"])}`.trim(), source: "package.json#dependencies.vue", confidence: "confirmed" });
    } else if (deps["svelte"]) {
      facts.push({ key: "frontend", value: "Svelte", source: "package.json#dependencies.svelte", confidence: "confirmed" });
    }

    // Backend / server
    if (deps["express"]) {
      facts.push({ key: "backend", value: `Express ${detectVersion(deps["express"])}`.trim(), source: "package.json#dependencies.express", confidence: "confirmed" });
    } else if (deps["fastify"]) {
      facts.push({ key: "backend", value: "Fastify", source: "package.json#dependencies.fastify", confidence: "confirmed" });
    } else if (deps["hono"]) {
      facts.push({ key: "backend", value: "Hono", source: "package.json#dependencies.hono", confidence: "confirmed" });
    }

    // ORM / database
    if (deps["drizzle-orm"]) {
      facts.push({ key: "orm", value: "Drizzle ORM", source: "package.json#dependencies.drizzle-orm", confidence: "confirmed" });
    } else if (deps["prisma"] || deps["@prisma/client"]) {
      facts.push({ key: "orm", value: "Prisma", source: "package.json#dependencies.prisma", confidence: "confirmed" });
    } else if (deps["typeorm"]) {
      facts.push({ key: "orm", value: "TypeORM", source: "package.json#dependencies.typeorm", confidence: "confirmed" });
    }

    if (deps["pg"]) facts.push({ key: "database", value: "PostgreSQL", source: "package.json#dependencies.pg", confidence: "confirmed" });
    else if (deps["mysql2"] || deps["mysql"]) facts.push({ key: "database", value: "MySQL", source: "package.json#dependencies", confidence: "confirmed" });
    else if (deps["better-sqlite3"] || deps["sqlite3"]) facts.push({ key: "database", value: "SQLite", source: "package.json#dependencies", confidence: "confirmed" });

    // Styling
    if (deps["tailwindcss"] || deps["@tailwindcss/vite"]) {
      facts.push({ key: "styling", value: "Tailwind CSS", source: "package.json#dependencies", confidence: "confirmed" });
    }

    // Language
    if (deps["typescript"]) {
      facts.push({ key: "language", value: `TypeScript ${detectVersion(deps["typescript"])}`.trim(), source: "package.json#devDependencies.typescript", confidence: "confirmed" });
    }
  } else {
    questions.push("No package.json found at workspace root — stack may be incomplete");
  }

  // ── pnpm-workspace.yaml ───────────────────────────────────────────────────
  try {
    await fs.access(path.join(workspaceDir, "pnpm-workspace.yaml"));
    // Only add if not already confirmed from package.json#packageManager
    if (!facts.find(f => f.key === "packageManager")) {
      facts.push({ key: "packageManager", value: "pnpm", source: "pnpm-workspace.yaml (presence)", confidence: "confirmed" });
    }
    if (!facts.find(f => f.key === "monorepo")) {
      facts.push({ key: "monorepo", value: "pnpm workspaces", source: "pnpm-workspace.yaml", confidence: "confirmed" });
    }
  } catch { /* not present */ }

  // ── lock file fallback for package manager ────────────────────────────────
  if (!facts.find(f => f.key === "packageManager")) {
    try {
      await fs.access(path.join(workspaceDir, "yarn.lock"));
      facts.push({ key: "packageManager", value: "yarn", source: "yarn.lock (presence)", confidence: "inferred" });
    } catch {
      try {
        await fs.access(path.join(workspaceDir, "package-lock.json"));
        facts.push({ key: "packageManager", value: "npm", source: "package-lock.json (presence)", confidence: "inferred" });
      } catch { /* no lock file */ }
    }
  }

  return { facts, questions };
}

// ---------------------------------------------------------------------------
// Services from artifact.toml
// ---------------------------------------------------------------------------

async function extractServices(workspaceDir: string): Promise<ServiceConfig[]> {
  const services: ServiceConfig[] = [];

  // Locate artifact.toml files up to 4 levels deep
  const found = await spawnLine(
    "find",
    [workspaceDir, "-name", "artifact.toml", "-maxdepth", "4", "-not", "-path", "*/node_modules/*"],
    workspaceDir,
    3_000,
  );
  if (!found) return services;

  for (const tomlPath of found.split("\n").filter(Boolean)) {
    const raw = await fs.readFile(tomlPath.trim(), "utf-8").catch(() => null);
    if (!raw) continue;

    // Minimal [[services]] block parser — TOML is hard to fully parse without a lib
    const serviceBlocks = raw.match(/\[\[services\]\][^\[]*/g) ?? [];
    for (const block of serviceBlocks) {
      const name = block.match(/name\s*=\s*["']([^"']+)["']/)?.[1] ?? "unknown";
      const portStr = block.match(/localPort\s*=\s*(\d+)/)?.[1];
      const pathMatch = block.match(/paths\s*=\s*\[([^\]]+)\]/)?.[1];
      const svcPath = pathMatch?.match(/["']([^"']+)["']/)?.[1] ?? "/";
      const port = portStr ? Number(portStr) : 0;
      if (port) services.push({ name, localPort: port, path: svcPath });
    }
  }

  return services;
}

// ---------------------------------------------------------------------------
// Build state from DB
// ---------------------------------------------------------------------------

async function getLastBuildState(projectId: number): Promise<ProjectSnapshot["buildState"]> {
  try {
    const result = await db.execute(sql`
      SELECT status, error_summary, started_at
      FROM project_builds
      WHERE project_id = ${projectId}
      ORDER BY started_at DESC
      LIMIT 1
    `);
    const row = result.rows[0];
    if (!row) return { lastResult: "unknown", lastAt: null, errorSummary: null };

    return {
      lastResult:
        row.status === "success" ? "success" :
        row.status === "failure" ? "failure" : "unknown",
      lastAt: row.started_at instanceof Date
        ? row.started_at.toISOString()
        : row.started_at ? String(row.started_at) : null,
      errorSummary: row.error_summary ? String(row.error_summary) : null,
    };
  } catch {
    return { lastResult: "unknown", lastAt: null, errorSummary: null };
  }
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

async function buildSnapshot(
  projectId: number,
  workspaceDir: string,
): Promise<ProjectSnapshot> {
  // Fan out all extractions in parallel — each is individually fault-tolerant
  const [gitState, stackResult, services, buildState] = await Promise.all([
    extractGitState(workspaceDir).catch(() => ({
      branch: null, headSha: null, dirty: null,
      lastCommitMessage: null, lastCommitAge: null,
    })),
    extractStackFacts(workspaceDir).catch(() => ({ facts: [], questions: ["Stack extraction failed"] })),
    extractServices(workspaceDir).catch(() => []),
    getLastBuildState(projectId),
  ]);

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    git: gitState,
    stack: stackResult.facts,
    services,
    buildState,
    openQuestions: stackResult.questions,
    freshness: "fresh",
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function getProjectSnapshot(
  projectId: number,
  workspaceDir: string,
  opts?: { forceRefresh?: boolean },
): Promise<ProjectSnapshot> {
  const entry = cache.get(projectId);
  if (!opts?.forceRefresh && entry && Date.now() < entry.expiresAt) {
    return { ...entry.snapshot, freshness: "cached" };
  }

  const snapshot = await buildSnapshot(projectId, workspaceDir);
  cache.set(projectId, { snapshot, expiresAt: Date.now() + SNAPSHOT_TTL_MS });
  return snapshot;
}
