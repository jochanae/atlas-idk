import { Router } from "express";
import { spawn, type ChildProcess } from "child_process";
import http from "http";
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync, unlinkSync, readdirSync, createReadStream, statSync } from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { logger } from "../lib/logger";
import { projectWorkspaceDir, assertProjectOwner } from "../lib/projectWorkspace";
import { db, projectsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logProjectArtifact } from "../lib/artifactLog";
import { classifyRepository } from "@workspace/repo-classifier";
import { loadClassificationInput } from "../services/repositoryClassificationSource";
import { decryptToken, decryptBinding } from "../lib/tokenCrypto";
import { createHash } from "crypto";

// ── Build-check work dir (separate from live devserver) ───────────────────
const BUILD_CHECK_DIR = "/tmp/atlas-build-check";

export interface BuildCheckResult {
  clean: boolean;
  errors: string[];
  duration: number;
}

function parseErrors(output: string): string[] {
  const lines = output.split("\n");
  const errors: string[] = [];
  for (const line of lines) {
    const clean = line.replace(/\x1B\[[0-9;]*m/g, "").trim();
    if (!clean) continue;
    // TypeScript errors
    if (/error TS\d+:/.test(clean)) { errors.push(clean); continue; }
    // Vite build errors
    if (/^\s*✗/.test(clean) || /^(ERROR|error)(\s|:)/.test(clean)) { errors.push(clean); continue; }
    // Rollup / esbuild module-not-found
    if (/Module not found|Failed to resolve import|Cannot find module/.test(clean)) { errors.push(clean); continue; }
    // React JSX transform errors
    if (/React is not defined|JSX/.test(clean) && /error/i.test(clean)) { errors.push(clean); continue; }
  }
  // Deduplicate, cap at 20
  return [...new Set(errors)].slice(0, 20);
}

// Extensions tried when resolving a bare relative import path (no extension given).
const RESOLVE_EXTENSIONS = [
  "", ".jsx", ".tsx", ".js", ".ts",
  "/index.jsx", "/index.tsx", "/index.js", "/index.ts",
];

// Directories we always skip when walking source files.
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", ".next", ".cache", "coverage", ".vite"]);

/**
 * Walk all JS/JSX/TS/TSX source files in wsDir and check every relative
 * `import … from './…'` statement.  Returns a list of human-readable error
 * strings for any import that cannot be resolved to an existing file.
 *
 * This runs before `npm run build` so Atlas gets actionable errors immediately
 * rather than after a slow full compile.
 */
function auditMissingImports(wsDir: string): string[] {
  const missing: string[] = [];
  const SOURCE_RE = /\.(jsx?|tsx?)$/;
  const IMPORT_RE = /(?:^|\n)\s*import\s[^'"]*['"](\.[^'"]+)['"]/g;
  const DYN_IMPORT_RE = /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g;

  function walkFiles(dir: string): string[] {
    const files: string[] = [];
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...walkFiles(full));
        else if (SOURCE_RE.test(entry.name)) files.push(full);
      }
    } catch {}
    return files;
  }

  function tryResolve(fromDir: string, importPath: string): boolean {
    const base = path.resolve(fromDir, importPath);
    // If path already has an extension that matches a source file, check directly
    if (SOURCE_RE.test(importPath)) {
      return existsSync(base);
    }
    // Try all candidate extensions
    return RESOLVE_EXTENSIONS.some((ext) => existsSync(base + ext));
  }

  const files = walkFiles(wsDir);
  const seenErrors = new Set<string>();

  for (const file of files) {
    let src: string;
    try { src = readFileSync(file, "utf8"); } catch { continue; }

    const fromDir = path.dirname(file);
    const relFile = path.relative(wsDir, file);

    const allMatches = [
      ...[...src.matchAll(IMPORT_RE)].map((m) => m[1]),
      ...[...src.matchAll(DYN_IMPORT_RE)].map((m) => m[1]),
    ];

    for (const importPath of allMatches) {
      if (!importPath.startsWith(".")) continue; // skip bare module specifiers
      if (tryResolve(fromDir, importPath)) continue;

      const key = `${relFile}:${importPath}`;
      if (seenErrors.has(key)) continue;
      seenErrors.add(key);
      missing.push(`Could not resolve "${importPath}" from "${relFile}"`);
    }
  }

  return missing;
}

/**
 * Run `npm run build` directly inside an already-populated workspace directory.
 * No cloning or installing — the workspace already has source files and
 * node_modules from the initial scaffold.  Installs only if node_modules is
 * absent (first run after a fresh scaffold).
 * Safe to call from the chat route — non-mutating except for a possible install.
 */
export async function runWorkspaceBuildCheck(wsDir: string): Promise<BuildCheckResult> {
  const t0 = Date.now();
  const logs: string[] = [];

  function capture(cmd: string, args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const out: string[] = [];
      const proc = spawn(cmd, args, {
        cwd,
        shell: true,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", CI: "true" },
      });
      proc.stdout?.on("data", (d: Buffer) => { const s = d.toString(); out.push(s); logs.push(s); });
      proc.stderr?.on("data", (d: Buffer) => { const s = d.toString(); out.push(s); logs.push(s); });
      proc.on("exit", (code) => {
        const combined = out.join("");
        if (code === 0) resolve(combined);
        else reject(Object.assign(new Error(`${cmd} exited ${code}`), { output: combined }));
      });
      proc.on("error", reject);
    });
  }

  try {
    if (!existsSync(wsDir)) {
      return { clean: false, errors: ["Workspace directory not found"], duration: Date.now() - t0 };
    }
    const pkgPath = path.join(wsDir, "package.json");
    if (!existsSync(pkgPath)) {
      return { clean: false, errors: ["No package.json in workspace"], duration: Date.now() - t0 };
    }

    // ── Phase 1: static import audit (fast, no build needed) ──────────────────
    // Catch missing files before spending time on a full compile.
    const missingImports = auditMissingImports(wsDir);
    if (missingImports.length > 0) {
      return {
        clean: false,
        errors: missingImports.map((e) => `[MISSING FILE] ${e}`),
        duration: Date.now() - t0,
      };
    }

    // ── Phase 2: full build ────────────────────────────────────────────────────
    // Install deps if missing (first run)
    if (!existsSync(path.join(wsDir, "node_modules"))) {
      const mgr = detectPackageManager(wsDir);
      const installArgs = mgr === "pnpm"
        ? ["install", "--no-frozen-lockfile", "--ignore-workspace"]
        : ["install", "--legacy-peer-deps"];
      await capture(mgr, installArgs, wsDir).catch(() => {});
    }

    // ── Phase 2a: scan for unresolvable bare-module imports ───────────────────
    // Catches packages that are imported in source but missing from node_modules
    // (e.g. react-router-dom listed nowhere in package.json). Auto-installs them
    // so Atlas doesn't need to know about package management.
    const BARE_IMPORT_RE = /(?:^|\n)\s*import\s[^'"]*['"]((?!\.)[^'"]+)['"]/gm;
    const DYN_BARE_RE = /\bimport\(\s*['"]((?!\.)[^'"]+)['"]\s*\)/gm;
    const SOURCE_BARE_RE = /\.(jsx?|tsx?)$/;
    const SKIP_BARE = new Set(["node:fs", "node:path", "node:url", "node:crypto", "node:child_process", "node:os"]);

    function barePackageName(spec: string): string {
      // @scope/pkg → @scope/pkg; pkg/sub → pkg
      if (spec.startsWith("@")) {
        const parts = spec.split("/");
        return parts.slice(0, 2).join("/");
      }
      return spec.split("/")[0];
    }

    const missingPackages = new Set<string>();
    try {
      const srcDir = path.join(wsDir, "src");
      const rootsToScan = [existsSync(srcDir) ? srcDir : wsDir];
      function scanForBare(dir: string): void {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) { scanForBare(full); continue; }
          if (!SOURCE_BARE_RE.test(entry.name)) continue;
          let src2: string;
          try { src2 = readFileSync(full, "utf8"); } catch { continue; }
          const specs = [
            ...[...src2.matchAll(BARE_IMPORT_RE)].map((m) => m[1]),
            ...[...src2.matchAll(DYN_BARE_RE)].map((m) => m[1]),
          ];
          for (const spec of specs) {
            if (SKIP_BARE.has(spec)) continue;
            const pkg = barePackageName(spec);
            if (!pkg || pkg.startsWith(".")) continue;
            const nmPath = path.join(wsDir, "node_modules", pkg);
            if (!existsSync(nmPath)) missingPackages.add(pkg);
          }
        }
      }
      for (const root of rootsToScan) scanForBare(root);
    } catch {}

    if (missingPackages.size > 0) {
      const pkgList = [...missingPackages];
      await capture("npm", ["install", "--legacy-peer-deps", ...pkgList], wsDir).catch(() => {});
    }

    await capture("npm", ["run", "build"], wsDir);
    return { clean: true, errors: [], duration: Date.now() - t0 };
  } catch (err: unknown) {
    const output = (err as { output?: string }).output ?? logs.join("");

    // ── Auto-repair: missing npm packages detected in build output ─────────────
    // Rollup emits "Rollup failed to resolve import "X"" for bare specifiers.
    // Parse those, install the packages, and retry the build once.
    const ROLLUP_BARE_RE = /Rollup failed to resolve import ["']([^"'@][^"'/]*)(?:\/[^"']*)?["']/g;
    const VITE_BARE_RE = /Cannot find module ['"]([^'"@.][^'"]*?)['"] or its corresponding type declarations/g;
    const autoInstall = new Set<string>();
    for (const [, pkg] of output.matchAll(ROLLUP_BARE_RE)) autoInstall.add(pkg.trim());
    for (const [, pkg] of output.matchAll(VITE_BARE_RE)) autoInstall.add(pkg.split("/")[0].trim());

    if (autoInstall.size > 0) {
      try {
        const pkgList = [...autoInstall];
        await capture("npm", ["install", "--legacy-peer-deps", ...pkgList], wsDir);
        await capture("npm", ["run", "build"], wsDir);
        return { clean: true, errors: [], duration: Date.now() - t0 };
      } catch (retryErr: unknown) {
        const retryOutput = (retryErr as { output?: string }).output ?? "";
        const retryErrors = parseErrors(retryOutput);
        return {
          clean: false,
          errors: retryErrors.length ? retryErrors : ["Build failed after auto-installing missing packages"],
          duration: Date.now() - t0,
        };
      }
    }

    const errors = parseErrors(output);
    return {
      clean: false,
      errors: errors.length ? errors : ["Build failed — no parseable errors captured"],
      duration: Date.now() - t0,
    };
  }
}

/**
 * Clone (or fast-update) a repo, install deps once, run `npm run build`,
 * and return whether it compiled cleanly.
 * Safe to call from the chat route — uses its own work dir, no shared state.
 */
export async function runBuildCheck(
  repoFullName: string,
  token: string,
): Promise<BuildCheckResult> {
  const t0 = Date.now();
  mkdirSync(BUILD_CHECK_DIR, { recursive: true });
  const repoName = repoFullName.split("/")[1];
  const repoDir = path.join(BUILD_CHECK_DIR, repoName);
  const logs: string[] = [];

  function capture(cmd: string, args: string[], cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const out: string[] = [];
      const proc = spawn(cmd, args, {
        cwd,
        shell: true,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", CI: "true" },
      });
      proc.stdout?.on("data", (d: Buffer) => { const s = d.toString(); out.push(s); logs.push(s); });
      proc.stderr?.on("data", (d: Buffer) => { const s = d.toString(); out.push(s); logs.push(s); });
      proc.on("exit", (code) => {
        const combined = out.join("");
        if (code === 0) resolve(combined);
        else reject(Object.assign(new Error(`${cmd} exited ${code}`), { output: combined }));
      });
      proc.on("error", reject);
    });
  }

  try {
    if (existsSync(path.join(repoDir, ".git"))) {
      // Fast-path: just pull latest commit
      await capture("git", [
        "-C", repoDir,
        "fetch", "--depth=1",
        `https://x-access-token:${token}@github.com/${repoFullName}.git`,
        "main",
      ]);
      await capture("git", ["-C", repoDir, "reset", "--hard", "FETCH_HEAD"]);
    } else {
      // Fresh clone
      if (existsSync(repoDir)) rmSync(repoDir, { recursive: true, force: true });
      await capture("git", [
        "clone", "--depth=1", "--branch=main",
        `https://x-access-token:${token}@github.com/${repoFullName}.git`,
        repoDir,
      ]);
    }

    // Install only when node_modules is absent (cache across checks)
    if (!existsSync(path.join(repoDir, "node_modules"))) {
      await capture("npm", ["install", "--legacy-peer-deps"], repoDir);
    }

    // Run build — Vite + tsc both emit on this command for the scaffold
    const buildOut = await capture("npm", ["run", "build"], repoDir);
    return { clean: true, errors: [], duration: Date.now() - t0 };
  } catch (err: unknown) {
    const output = (err as { output?: string }).output ?? logs.join("");
    const errors = parseErrors(output);
    logger.warn({ repo: repoFullName, errorCount: errors.length }, "build-check: errors found");
    return { clean: false, errors: errors.length ? errors : ["Build failed — no parseable errors captured"], duration: Date.now() - t0 };
  }
}

type DevStatus = "idle" | "cloning" | "installing" | "starting" | "running" | "error";

// ── Phase 5 lifecycle types ────────────────────────────────────────────────
type RuntimeProcessStatus =
  | "idle"
  | "installing"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "restarting"
  | "crashed"
  | "error";

/** Why Atlas sent SIGTERM — consumed by the exit listener to classify the outcome. */
type StopReason = "user" | "restart" | "replacement" | "shutdown";

type RuntimeEventType =
  | "install_started"
  | "install_completed"
  | "start_requested"
  | "runtime_connected"
  | "stop_requested"
  | "runtime_stopped"
  | "runtime_crashed"
  | "restart_requested"
  | "drift_detected"
  | "reinstall_required"
  | "runtime_error";

/** Two orthogonal dimensions — never collapsed into a single status string. */
interface RuntimeReadiness {
  /** env + binding configuration vs last verified snapshot */
  configuration: "ready" | "changed" | "missing";
  /** node_modules freshness vs lockfile/manifest */
  dependencies: "ready" | "reinstall-required";
  /** classifier target shape vs last snapshot */
  classification: "current" | "stale";
}

/** Stored at markVerified time; compared on restart for drift detection (5C). */
interface RuntimeVerificationSnapshot {
  targetId: string;
  /** SHA-256[:16] of id+framework+startCommand+envKeys — detects classifier drift */
  classificationHash: string;
  /** Env var names in scope at last verified run (no values) */
  requiredEnvKeys: string[];
  /** Binding IDs at last verified run — identity change triggers config-changed */
  serviceBindingIds: string[];
  /** SHA-256[:16] of lockfile at last install — detects dep changes */
  installFingerprint: string;
  /** Per-file SHA-256[:16] of structural config files (package.json, lock, etc.) */
  structuralFileHashes: Record<string, string>;
  verifiedAt: string;
}

/**
 * Safe restart recipe — persisted server-side so Restart survives page refresh
 * and workspace reopen. Never stores secret values; binding IDs are sufficient
 * for server-managed credential resolution.
 */
interface RuntimeLaunchRecipe {
  targetId: string;
  serviceBindingIds: string[];
  /** Only env var names declared by the classifier for this target — no secrets */
  approvedPublicEnv: Record<string, string>;
  classificationHash: string;
  installFingerprint: string;
  updatedAt: string;
}

const state: {
  status: DevStatus;
  port: number | null;
  proc: ChildProcess | null;
  repoFullName: string | null;
  logs: string[];
  errorMsg: string | null;
} = {
  status: "idle",
  port: null,
  proc: null,
  repoFullName: null,
  logs: [],
  errorMsg: null,
};

const WORK_DIR = "/tmp/atlas-devserver";

// ── Per-workspace devserver state (one per projectId) ──────────────────────
interface WsDevState {
  status: RuntimeProcessStatus;
  port: number | null;
  proc: ChildProcess | null;
  logs: string[];
  errorMsg: string | null;
  startedAt: Date | null;
  /** Set when the current process has been verified; cleared on process exit. */
  verifiedTargetId: string | null;
  verifiedAt: Date | null;
  /** Historical: the last target that was successfully verified — survives process exit. */
  lastVerifiedTargetId: string | null;
  lastVerifiedAt: Date | null;
  /** Monotonic counter — incremented on each /run call to prevent stale callbacks
   *  from a previous async IIFE from overwriting state owned by a newer run. */
  runGen: number;
  // ── Phase 5 fields ────────────────────────────────────────────────────────
  /** Set before SIGTERM — consumed by exit listener to classify outcome. */
  pendingStopReason: StopReason | null;
  /** Two-dimensional readiness — separate from process status (5A/5C). */
  readiness: RuntimeReadiness;
  /** Snapshot stored at markVerified — used for drift detection on restart (5C). */
  verificationSnapshot: RuntimeVerificationSnapshot | null;
  /** userId from the last authenticated /run or /stop — used for event logging. */
  runUserId: number | null;
  /**
   * Safe restart recipe — persisted so Restart works after page refresh.
   * Written at markVerified time; read by POST /restart.
   */
  launchRecipe: RuntimeLaunchRecipe | null;
}

const wsStates = new Map<number, WsDevState>();

// Persist port so API server restarts don't lose track of running Vite servers.
// Files live at /tmp/atlas-ws-{projectId}.json  →  { port, pid? }
const WS_PERSIST_DIR = "/tmp";
function wsPersistPath(projectId: number) { return path.join(WS_PERSIST_DIR, `atlas-ws-${projectId}.json`); }

function wsSaveState(
  projectId: number,
  port: number,
  pid?: number,
  verifiedTargetId?: string,
  lastVerifiedTargetId?: string,
  launchRecipe?: RuntimeLaunchRecipe | null,
) {
  try {
    writeFileSync(
      wsPersistPath(projectId),
      JSON.stringify({ port, pid, verifiedTargetId, lastVerifiedTargetId, launchRecipe: launchRecipe ?? null }),
    );
  } catch {}
}
function wsDeleteState(projectId: number) {
  try { unlinkSync(wsPersistPath(projectId)); } catch {}
}

// On module load: probe any persisted ports and re-adopt still-running servers.
// This runs once when the API server starts so a rebuild doesn't lose the "Running" badge.
(async () => {
  const files = readdirSync(WS_PERSIST_DIR).filter(f => /^atlas-ws-\d+\.json$/.test(f));
  for (const f of files) {
    try {
      const projectId = Number(f.replace("atlas-ws-", "").replace(".json", ""));
      const { port, pid, verifiedTargetId, lastVerifiedTargetId, launchRecipe } = JSON.parse(
        readFileSync(path.join(WS_PERSIST_DIR, f), "utf8")
      ) as { port: number; pid?: number; verifiedTargetId?: string; lastVerifiedTargetId?: string; launchRecipe?: RuntimeLaunchRecipe | null };
      // HTTP probe — only re-adopt if the process is actually responding.
      // "Was verified before" and "is currently running" are different facts.
      const alive = await new Promise<boolean>((resolve) => {
        const req = http.request({ hostname: "localhost", port, path: "/", method: "HEAD", timeout: 800 }, () => { req.destroy(); resolve(true); });
        req.on("error", () => resolve(false));
        req.on("timeout", () => { req.destroy(); resolve(false); });
        req.end();
      });
      if (alive) {
        const st = getWsState(projectId);
        st.port = port; st.status = "running";
        if (verifiedTargetId) { st.verifiedTargetId = verifiedTargetId; st.verifiedAt = new Date(); }
        const lvt = lastVerifiedTargetId ?? verifiedTargetId;
        if (lvt) { st.lastVerifiedTargetId = lvt; st.lastVerifiedAt = new Date(); }
        if (launchRecipe) { st.launchRecipe = launchRecipe; }
        st.logs = [`[re-adopted] Dev server accepted connections on port ${port}${pid ? ` (pid ${pid})` : ""}${verifiedTargetId ? ` · last-verified: ${verifiedTargetId}` : ""}`];
        logger.info({ projectId, port, verifiedTargetId }, "Re-adopted workspace dev server after API restart");
        // Heartbeat: adopted processes have no proc reference to watch for exit.
        // Re-probe every 30s and clear state if the port goes dark.
        const hb = setInterval(async () => {
          const cur = wsStates.get(projectId);
          if (!cur || cur.proc !== null || cur.status !== "running") { clearInterval(hb); return; }
          const still = await new Promise<boolean>((resolve) => {
            const r = http.request({ hostname: "localhost", port: cur.port!, path: "/", method: "HEAD", timeout: 800 }, () => { r.destroy(); resolve(true); });
            r.on("error", () => resolve(false));
            r.on("timeout", () => { r.destroy(); resolve(false); });
            r.end();
          });
          if (!still) {
            clearInterval(hb);
            cur.status = "idle";
            cur.port = null;
            cur.verifiedTargetId = null;
            cur.verifiedAt = null;
            wsDeleteState(projectId);
            logger.info({ projectId }, "Adopted workspace dev server stopped — marked idle");
          }
        }, 30_000);
      } else {
        // Port not alive — preserve lastVerified history but clear running state.
        wsDeleteState(projectId);
      }
    } catch {}
  }
})();

function getWsState(projectId: number): WsDevState {
  if (!wsStates.has(projectId)) {
    wsStates.set(projectId, {
      status: "idle",
      port: null,
      proc: null,
      logs: [],
      errorMsg: null,
      startedAt: null,
      verifiedTargetId: null,
      verifiedAt: null,
      lastVerifiedTargetId: null,
      lastVerifiedAt: null,
      runGen: 0,
      pendingStopReason: null,
      readiness: { configuration: "ready", dependencies: "ready", classification: "current" },
      verificationSnapshot: null,
      runUserId: null,
      launchRecipe: null,
    });
  }
  return wsStates.get(projectId)!;
}

function addWsLog(st: WsDevState, line: string) {
  const trimmed = line.trim().slice(0, 2048);
  if (!trimmed) return;
  st.logs.push(trimmed);
  if (st.logs.length > 300) st.logs.shift();
}

// ── Phase 5A: Canonical lifecycle transition ───────────────────────────────
// All WsDevState.status mutations go through here so history and state
// are always written together and never diverge.
//
// Rule: call transitionRuntime THEN update other st fields (port, errorMsg, etc.)
// so that the event row snapshot matches the new status.
function transitionRuntime(
  projectId: number,
  st: WsDevState,
  opts: {
    status: RuntimeProcessStatus;
    eventType: RuntimeEventType;
    targetId?: string | null;
    detail?: Record<string, unknown>;
  },
): void {
  st.status = opts.status;
  // Fire-and-forget DB insert — never blocks the request critical path.
  if (st.runUserId) {
    db.execute(sql`
      INSERT INTO runtime_events (project_id, user_id, event_type, target_id, detail)
      VALUES (
        ${projectId},
        ${st.runUserId},
        ${opts.eventType},
        ${opts.targetId ?? null},
        ${JSON.stringify(opts.detail ?? {})}
      )
    `).catch((err: unknown) => {
      logger.warn({ err, projectId, eventType: opts.eventType }, "runtime_events: insert failed");
    });
  }
}

// ── Phase 5C: Structural file hashes for drift detection ───────────────────
// Hashes are stored at markVerified time and compared on restart.
// Only high-signal files that change runtime requirements are included.
const STRUCTURAL_FILES = [
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "vite.config.ts", "vite.config.js", "vite.config.mjs",
  "next.config.ts", "next.config.js", "next.config.mjs",
  "tsconfig.json",
  ".env.example",
  "prisma/schema.prisma",
];

async function computeStructuralFileHashes(workDir: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  await Promise.all(
    STRUCTURAL_FILES.map(async (file) => {
      try {
        const content = await fsPromises.readFile(path.join(workDir, file), "utf8");
        result[file] = createHash("sha256").update(content).digest("hex").slice(0, 16);
      } catch {
        // file absent — no entry
      }
    }),
  );
  return result;
}

function computeClassificationHash(target: {
  id: string;
  framework: string;
  startCommand: string;
  environmentVariables: string[];
}): string {
  const payload = `${target.id}|${target.framework}|${target.startCommand}|${[...target.environmentVariables].sort().join(",")}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

// Find a free port in the workspace devserver range (5200-5299)
async function allocateFreePort(): Promise<number> {
  const usedPorts = new Set(
    [...wsStates.values()].map(s => s.port).filter((p): p is number => p !== null)
  );
  for (let p = 5200; p < 5300; p++) {
    if (usedPorts.has(p)) continue;
    const isFree = await new Promise<boolean>((resolve) => {
      const req = http.request(
        { hostname: "localhost", port: p, path: "/", method: "HEAD", timeout: 400 },
        () => resolve(false),
      );
      req.on("error", () => resolve(true));
      req.on("timeout", () => { req.destroy(); resolve(false); });
      req.end();
    });
    if (isFree) return p;
  }
  throw new Error("No free ports available in range 5200–5299");
}

function addLog(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;
  state.logs.push(trimmed);
  if (state.logs.length > 300) state.logs.shift();
}

function killProc() {
  if (state.proc) {
    try { state.proc.kill("SIGTERM"); } catch {}
    state.proc = null;
  }
}

// Port we must never proxy to — that's our own API server
const OWN_PORT = parseInt(process.env.PORT ?? "8080", 10);

function detectPort(line: string): number | null {
  const clean = line.replace(/\x1B\[[0-9;]*m/g, "");

  // Only consider lines that look like actual server-ready announcements
  const isReadyLine = /\b(local|network|ready|listening|running|started|available|serving|server)\b/i.test(clean);
  if (!isReadyLine) return null;

  const patterns = [
    /localhost:(\d{4,5})/i,
    /127\.0\.0\.1:(\d{4,5})/i,
    /http:\/\/[^:]+:(\d{4,5})/i,
    /\bport[:\s]+(\d{4,5})/i,
    /:(\d{4,5})\s*$/,
  ];
  for (const p of patterns) {
    const m = clean.match(p);
    if (m) {
      const port = parseInt(m[1], 10);
      if (port > 1024 && port < 65535 && port !== OWN_PORT) return port;
    }
  }
  return null;
}

// Poll common ports to find a running server (fallback when stdout doesn't announce the port)
function pollForPort(candidates: number[]): Promise<number | null> {
  return new Promise((resolve) => {
    let checked = 0;
    if (candidates.length === 0) { resolve(null); return; }
    for (const port of candidates) {
      const req = http.request({ hostname: "localhost", port, path: "/", method: "HEAD", timeout: 1500 }, () => {
        resolve(port);
      });
      req.on("error", () => {
        checked++;
        if (checked === candidates.length) resolve(null);
      });
      req.on("timeout", () => { req.destroy(); });
      req.end();
    }
  });
}

function detectDevCommand(repoDir: string, viteBase?: string): { cmd: string; args: string[]; useMgr: string } {
  const useMgr = detectPackageManager(repoDir);
  try {
    const pkgRaw = readFileSync(path.join(repoDir, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const scripts = pkg.scripts ?? {};
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const isVite = !!allDeps["vite"] || (scripts["dev"] ?? "").includes("vite");
    const isNext = !!allDeps["next"] || (scripts["dev"] ?? "").includes("next");

    if (scripts["dev"]) {
      if (isVite && !isNext) {
        // Pass --host so Vite accepts proxied requests.
        // Note: we intentionally do NOT pass --base here. Apps use HashRouter
        // which ignores the URL path, so no base path configuration is needed.
        return { cmd: useMgr, args: ["run", "dev", "--", "--host", "0.0.0.0"], useMgr };
      }
      return { cmd: useMgr, args: ["run", "dev"], useMgr };
    }
    if (scripts["start"]) return { cmd: useMgr, args: ["start"], useMgr };
    if (scripts["serve"]) return { cmd: useMgr, args: ["run", "serve"], useMgr };
  } catch {}
  return { cmd: useMgr, args: ["run", "dev"], useMgr };
}

function detectPackageManager(repoDir: string): string {
  if (existsSync(path.join(repoDir, "pnpm-lock.yaml")) || existsSync(path.join(repoDir, "pnpm-workspace.yaml"))) return "pnpm";
  if (existsSync(path.join(repoDir, "yarn.lock"))) return "yarn";
  return "npm";
}

function runCommand(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd,
      shell: true,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    });
    proc.stdout?.on("data", (d: Buffer) => addLog(d.toString()));
    proc.stderr?.on("data", (d: Buffer) => addLog(d.toString()));
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

// Build a human-readable error from the last N log lines
function buildErrorSummary(msg: string): string {
  const recent = state.logs.slice(-12).filter(l =>
    !l.startsWith("npm warn") && !l.startsWith("npm notice") && l.trim().length > 0
  );
  if (recent.length > 0) return `${msg}\n\nLast output:\n${recent.join("\n")}`;
  return msg;
}

const router = Router();

router.post("/devserver/start", (req, res): void => {
  const { repoFullName, branch = "main", envVars = {} } = req.body as { repoFullName: string; branch?: string; envVars?: Record<string, string> };
  const rawToken = req.headers["x-github-token"] as string | undefined;
  const token = (rawToken && rawToken !== "__server__" && rawToken !== "__account__" && rawToken !== "__oauth__") ? rawToken : (process.env.GITHUB_TOKEN ?? undefined);

  if (!repoFullName) {
    res.status(400).json({ error: "Missing repoFullName" });
    return;
  }
  if (!token) {
    res.status(400).json({ error: "No GitHub token available. Add one in the Files tab or set GITHUB_TOKEN." });
    return;
  }

  killProc();
  state.status = "cloning";
  state.port = null;
  state.repoFullName = repoFullName;
  state.logs = [`Starting: cloning ${repoFullName} (${branch})…`];
  state.errorMsg = null;

  res.json({ status: state.status });

  (async () => {
    try {
      mkdirSync(WORK_DIR, { recursive: true });
      const repoName = repoFullName.split("/")[1];
      const repoDir = path.join(WORK_DIR, repoName);

      if (existsSync(repoDir)) {
        addLog("Removing existing clone…");
        rmSync(repoDir, { recursive: true, force: true });
      }

      addLog(`Cloning ${repoFullName}…`);
      await runCommand(
        "git",
        ["clone", "--depth=1", `--branch=${branch}`,
          `https://x-access-token:${token}@github.com/${repoFullName}.git`,
          repoDir],
      );

      state.status = "installing";
      const mgr = detectPackageManager(repoDir);
      addLog(`Installing dependencies with ${mgr}…`);

      // Build install args — pnpm needs --no-frozen-lockfile when outside its workspace
      const installArgs = mgr === "pnpm"
        ? ["install", "--no-frozen-lockfile", "--ignore-workspace"]
        : mgr === "yarn"
          ? ["install", "--frozen-lockfile=false"]
          : ["install", "--legacy-peer-deps"];

      try {
        await runCommand(mgr, installArgs, repoDir);
      } catch (installErr) {
        // If pnpm fails due to a catalog resolution error, retry with npm
        const recentLogs = state.logs.slice(-20).join("\n");
        if (mgr === "pnpm" && recentLogs.includes("ERR_PNPM_CATALOG_ENTRY_NOT_FOUND")) {
          addLog("pnpm catalog error detected — retrying with npm…");
          try {
            await runCommand("npm", ["install", "--legacy-peer-deps"], repoDir);
          } catch (npmErr) {
            const msg = npmErr instanceof Error ? npmErr.message : "Install failed";
            state.status = "error";
            state.errorMsg = buildErrorSummary(`Dependency install failed: ${msg}. If the app needs env vars (DATABASE_URL, API keys), add them in the LOCAL tab env section and relaunch.`);
            addLog(`✗ Install failed: ${msg}`);
            logger.error({ err: npmErr, repo: repoFullName }, "Dev server install failed (npm fallback)");
            return;
          }
        } else {
          // Install failed — surface reason clearly
          const msg = installErr instanceof Error ? installErr.message : "Install failed";
          state.status = "error";
          state.errorMsg = buildErrorSummary(`Dependency install failed: ${msg}. If the app needs env vars (DATABASE_URL, API keys), add them in the LOCAL tab env section and relaunch.`);
          addLog(`✗ Install failed: ${msg}`);
          logger.error({ err: installErr, repo: repoFullName }, "Dev server install failed");
          return;
        }
      }

      state.status = "starting";
      const { cmd, args } = detectDevCommand(repoDir);
      addLog(`Starting dev server: ${cmd} ${args.join(" ")}…`);

      const proc = spawn(cmd, args, {
        cwd: repoDir,
        shell: true,
        env: {
          ...process.env,
          FORCE_COLOR: "0",
          NO_COLOR: "1",
          PORT: "5173",
          HOST: "0.0.0.0",
          ...envVars,
        },
      });
      state.proc = proc;

      // Port-detection timeout: if no announcement after 45s, poll common ports
      const portFallbackTimer = setTimeout(async () => {
        if (state.status === "starting" && state.proc) {
          addLog("Port not announced — probing common ports…");
          const found = await pollForPort([5173, 3000, 4173, 8080, 8000, 4000].filter(p => p !== OWN_PORT));
          if (found && state.status === "starting") {
            state.port = found;
            state.status = "running";
            addLog(`✓ Dev server detected on port ${found} (via probe)`);
            logger.info({ port: found, repo: repoFullName }, "Dev server found via port probe");
          } else if (state.status === "starting") {
            // Still starting but nothing found — wait another 30s before giving up
            setTimeout(async () => {
              if (state.status !== "starting") return;
              const found2 = await pollForPort([5173, 3000, 4173, 8080].filter(p => p !== OWN_PORT));
              if (found2) {
                state.port = found2;
                state.status = "running";
                addLog(`✓ Dev server on port ${found2}`);
              } else {
                state.status = "error";
                state.errorMsg = buildErrorSummary("Dev server started but no port was reachable after 75s. Check if the app needs environment variables (DATABASE_URL, API keys) to start — add them in the env section and relaunch.");
                addLog("✗ No running port found after timeout.");
              }
            }, 30_000);
          }
        }
      }, 45_000);

      const onData = (d: Buffer) => {
        const line = d.toString();
        addLog(line);
        if (state.status !== "running") {
          const port = detectPort(line);
          if (port) {
            clearTimeout(portFallbackTimer);
            state.port = port;
            state.status = "running";
            addLog(`✓ Dev server running on port ${port}`);
            logger.info({ port, repo: repoFullName }, "Dev server running");
          }
        }
      };

      proc.stdout?.on("data", onData);
      proc.stderr?.on("data", onData);

      proc.on("exit", (code) => {
        clearTimeout(portFallbackTimer);
        if (state.status !== "idle") {
          if (code !== 0) {
            state.status = "error";
            state.errorMsg = buildErrorSummary(
              `Dev server exited (code ${code}). Most likely cause: missing environment variables (DATABASE_URL, auth keys, API secrets). Add them in the env section of the LOCAL tab and relaunch.`
            );
            addLog(`✗ Dev server exited with code ${code}`);
          } else {
            state.status = "idle";
          }
        }
        state.proc = null;
      });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      state.status = "error";
      state.errorMsg = buildErrorSummary(`Failed to start: ${msg}`);
      addLog(`Error: ${msg}`);
      logger.error({ err }, "Dev server start failed");
    }
  })();
});

router.get("/devserver/status", (_req, res): void => {
  res.json({
    status: state.status,
    port: state.port,
    repoFullName: state.repoFullName,
    logs: state.logs.slice(-50),
    errorMsg: state.errorMsg,
  });
});

router.post("/devserver/build-check", (req, res): void => {
  const { repo } = req.body as { repo?: string };
  const rawToken = req.headers["x-github-token"] as string | undefined;
  const token = (rawToken && rawToken !== "__server__" && rawToken !== "__account__" && rawToken !== "__oauth__") ? rawToken : (process.env.GITHUB_TOKEN ?? "");

  if (!repo) { res.status(400).json({ error: "Missing repo" }); return; }
  if (!token) { res.status(400).json({ error: "No GitHub token available" }); return; }

  runBuildCheck(repo, token)
    .then((result) => res.json(result))
    .catch((err) => {
      logger.error({ err }, "build-check route error");
      res.status(500).json({ error: "Build check failed", details: String(err) });
    });
});

router.post("/devserver/stop", (_req, res): void => {
  killProc();
  state.status = "idle";
  state.port = null;
  state.logs = [];
  state.errorMsg = null;
  res.json({ status: "idle" });
});

const PROXY_BASE = "/api/devserver/proxy";

// Injected into every proxied page — captures JS errors and posts them to the
// parent frame so the Local Dev panel can surface them without browser DevTools.
const ERROR_CAPTURE_SCRIPT = `<script>(function(){` +
  `var _ce=console.error.bind(console);` +
  `console.error=function(){_ce.apply(console,arguments);` +
  `try{window.parent.postMessage({__atlasConsole:'error',msg:Array.from(arguments).map(String).join(' ')},'*')}catch(e){}};` +
  `window.onerror=function(msg,src,line){` +
  `try{window.parent.postMessage({__atlasConsole:'error',msg:msg+' ('+src+':'+line+')'},'*')}catch(e){}};` +
  `window.onunhandledrejection=function(e){` +
  `try{window.parent.postMessage({__atlasConsole:'error',msg:'Unhandled: '+String(e.reason)},'*')}catch(e){}};` +
  `})()</script>`;

// Rewrite absolute-path asset references so they route through this proxy
function rewriteHtml(html: string, base = PROXY_BASE): string {
  let out = html.replace(/(<head[^>]*>)/i, `$1<base href="${base}/">${ERROR_CAPTURE_SCRIPT}`);
  out = out.replace(/((?:src|href|action|srcset)=["'])\/(?!\/)/g, `$1${base}/`);
  out = out.replace(/url\((['"]?)\/(?!\/)/g, `url($1${base}/`);
  return out;
}

function rewriteCss(css: string, base = PROXY_BASE): string {
  return css.replace(/url\((['"]?)\/(?!\/)/g, `url($1${base}/`);
}

// Rewrite root-relative ESM import/export paths so they route through the proxy.
// Only touches `from "/..."`, `import "/..."`, and dynamic `import("/...")`.
// Does NOT touch string literals, comments, or other code.
function rewriteJs(js: string, base: string): string {
  let out = js;
  // Static imports/exports: from "/path" and import "/path"
  out = out.replace(/((?:from|import)\s+["'])\/(?!\/)/g, `$1${base}/`);
  // Dynamic imports: import("/path") and import('/path')
  out = out.replace(/\bimport\((["'])\/(?!\/)/g, `import($1${base}/`);
  return out;
}

// Generic proxy handler — forwards req to targetPort, rewrites HTML/CSS/JS paths
function proxyToPort(targetPort: number, proxyBase: string, req: import("express").Request, res: import("express").Response): void {
  const targetPath = req.url || "/";

  // Stub /@vite/client — HMR WebSocket can't work through the proxy, but CSS modules
  // import updateStyle/removeStyle from this module to inject their content into the page.
  // We must export those so CSS actually loads; everything else is a no-op.
  if (targetPath === "/@vite/client" || targetPath.startsWith("/@vite/client?")) {
    res.setHeader("Content-Type", "application/javascript");
    res.end(`
// @vite/client proxy stub — no WebSocket, but CSS injection still works
export function createHotContext(_id) {
  return {
    accept() {}, dispose() {}, decline() {}, invalidate() {},
    on() {}, off() {}, send() {}, prune() {},
  };
}
export function updateStyle(id, css) {
  const safeId = 'vite-css-' + id.replace(/[^a-z0-9]/gi, '-');
  let el = document.getElementById(safeId);
  if (!el) {
    el = document.createElement('style');
    el.id = safeId;
    document.head.appendChild(el);
  }
  el.textContent = css;
}
export function removeStyle(id) {
  const el = document.getElementById('vite-css-' + id.replace(/[^a-z0-9]/gi, '-'));
  if (el) el.parentNode && el.parentNode.removeChild(el);
}
export const injectQuery = (url) => url;
`);
    return;
  }

  const options: http.RequestOptions = {
    hostname: "localhost",
    port: targetPort,
    path: targetPath,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${targetPort}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    const contentType = (proxyRes.headers["content-type"] ?? "").toLowerCase();
    const isHtml = contentType.includes("text/html");
    const isCss = contentType.includes("text/css");
    const isJs = contentType.includes("javascript") || contentType.includes("ecmascript");
    const needsRewrite = isHtml || isCss || isJs;

    const headers: Record<string, string | string[] | undefined> = {};
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      const lk = k.toLowerCase();
      if (lk === "x-frame-options") continue;
      if (lk === "content-security-policy") continue;
      if (needsRewrite && lk === "content-encoding") continue;
      if (needsRewrite && lk === "content-length") continue;
      if (lk === "location" && typeof v === "string") {
        let loc = v;
        loc = loc.replace(/^https?:\/\/localhost:\d+/, "");
        loc = loc.replace(/^https?:\/\/127\.0\.0\.1:\d+/, "");
        if (loc.startsWith("/") && !loc.startsWith(proxyBase)) loc = `${proxyBase}${loc}`;
        headers[k] = loc;
        continue;
      }
      headers[k] = v;
    }

    if (needsRewrite) {
      const chunks: Buffer[] = [];
      proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
      proxyRes.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let rewritten: string;
        if (isHtml) rewritten = rewriteHtml(raw, proxyBase);
        else if (isCss) rewritten = rewriteCss(raw, proxyBase);
        else rewritten = rewriteJs(raw, proxyBase);
        res.writeHead(proxyRes.statusCode ?? 200, headers);
        res.end(rewritten, "utf8");
      });
    } else {
      res.writeHead(proxyRes.statusCode ?? 200, headers);
      proxyRes.pipe(res, { end: true });
    }
  });

  req.pipe(proxyReq, { end: true });
  proxyReq.on("error", (e) => {
    logger.warn({ err: e }, "Proxy error");
    if (!res.headersSent) res.status(502).json({ error: "Proxy error" });
  });
}

// GitHub-repo devserver proxy (existing)
router.use("/devserver/proxy", (req, res): void => {
  if (!state.port) { res.status(503).json({ error: "Dev server not running" }); return; }
  proxyToPort(state.port, PROXY_BASE, req, res);
});

// ── Workspace devserver routes ─────────────────────────────────────────────

router.post("/devserver/workspace/:projectId/start", (req, res): void => {
  const projectId = Number(req.params["projectId"]);
  if (!projectId) { res.status(400).json({ error: "Invalid projectId" }); return; }

  const wsDir = projectWorkspaceDir(projectId);
  const pkgPath = path.join(wsDir, "package.json");
  if (!existsSync(pkgPath)) {
    res.status(400).json({ error: `No package.json in workspace ${projectId} (${wsDir})` });
    return;
  }

  const st = getWsState(projectId);
  if (st.proc) { try { st.proc.kill("SIGTERM"); } catch {} st.proc = null; }
  st.status = "installing";
  st.port = null;
  st.logs = [`Starting workspace ${projectId}…`];
  st.errorMsg = null;

  res.json({ status: st.status });

  (async () => {
    try {
      // Install if node_modules absent OR if package.json was modified after
      // node_modules (i.e. Atlas added new deps like tailwindcss since last install).
      const nmPath = path.join(wsDir, "node_modules");
      const pkgJsonPath = path.join(wsDir, "package.json");
      let needsInstall = !existsSync(nmPath);
      if (!needsInstall) {
        try {
          const [pkgStat, nmStat] = await Promise.all([
            fsPromises.stat(pkgJsonPath),
            fsPromises.stat(nmPath),
          ]);
          if (pkgStat.mtimeMs > nmStat.mtimeMs) {
            needsInstall = true;
            addWsLog(st, "package.json updated — reinstalling dependencies…");
          }
        } catch { /* stat failed, proceed without reinstall */ }
      }
      if (needsInstall) {
        const mgr = detectPackageManager(wsDir);
        addWsLog(st, `Installing with ${mgr}…`);
        const installArgs = mgr === "pnpm"
          ? ["install", "--no-frozen-lockfile", "--ignore-workspace"]
          : mgr === "yarn"
            ? ["install", "--frozen-lockfile=false"]
            : ["install", "--legacy-peer-deps"];

        // Run install, capturing all output so we can detect 403-blocked packages
        const runInstall = () => new Promise<{ ok: boolean; output: string }>((resolve) => {
          const chunks: string[] = [];
          const proc = spawn(mgr, installArgs, {
            cwd: wsDir, shell: true,
            env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
          });
          const onData = (d: Buffer) => { const s = d.toString(); chunks.push(s); addWsLog(st, s); };
          proc.stdout?.on("data", onData);
          proc.stderr?.on("data", onData);
          proc.on("exit", (code) => resolve({ ok: code === 0, output: chunks.join("") }));
          proc.on("error", (e) => resolve({ ok: false, output: e.message }));
        });

        let result = await runInstall();

        // If install failed with 403 (Replit security policy blocks some packages like vitest),
        // strip the blocked packages from package.json and retry once.
        if (!result.ok && result.output.includes("E403")) {
          const blocked = new Set<string>();
          for (const m of result.output.matchAll(/403.*?\/([^/\s]+)\/-\//g)) blocked.add(m[1]);
          if (blocked.size > 0) {
            const pkgPath = path.join(wsDir, "package.json");
            const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
              dependencies?: Record<string, string>;
              devDependencies?: Record<string, string>;
            };
            const stripped: string[] = [];
            for (const name of blocked) {
              if (pkg.dependencies?.[name]) { delete pkg.dependencies[name]; stripped.push(name); }
              if (pkg.devDependencies?.[name]) { delete pkg.devDependencies[name]; stripped.push(name); }
            }
            if (stripped.length > 0) {
              addWsLog(st, `⚠ Blocked by Replit security policy: ${stripped.join(", ")} — removing and retrying…`);
              writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
              result = await runInstall();
              if (result.ok) addWsLog(st, `✓ Installed (${stripped.join(", ")} skipped — not available in this environment)`);
            }
          }
        }

        if (!result.ok) throw new Error(`Dependency install failed: ${mgr} exited with code 1. If the app needs env vars (DATABASE_URL, API keys), add them in the LOCAL tab env section and relaunch.\nLast output: ${result.output.slice(-800)}`);
      }

      // Build the project and serve via the static /api/preview/workspace/:id/ route.
      // This avoids the Vite dev-mode proxy complexity entirely.
      st.status = "starting";
      addWsLog(st, "Building project…");
      const mgr2 = detectPackageManager(wsDir);
      const buildArgs = ["run", "build"];
      const buildResult = await new Promise<{ ok: boolean; output: string }>((resolve) => {
        const chunks: string[] = [];
        const proc = spawn(mgr2, buildArgs, {
          cwd: wsDir, shell: true,
          env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
        });
        st.proc = proc;
        const onData = (d: Buffer) => { const s = d.toString(); chunks.push(s); addWsLog(st, s); };
        proc.stdout?.on("data", onData);
        proc.stderr?.on("data", onData);
        proc.on("exit", (code) => resolve({ ok: code === 0, output: chunks.join("") }));
        proc.on("error", (e) => resolve({ ok: false, output: e.message }));
      });
      st.proc = null;

      if (!buildResult.ok) {
        // Record build failure — project is still typed as "app" (files exist)
        db.update(projectsTable)
          .set({ projectType: "app", appBuildSucceeded: false })
          .where(eq(projectsTable.id, projectId))
          .catch((e) => logger.warn({ err: e, projectId }, "Failed to update appBuildSucceeded=false"));
        throw new Error(`Build failed.\nLast output:\n${buildResult.output.slice(-800)}`);
      }

      // Count source files written to the workspace (exclude hidden dirs, node_modules, dist)
      const SKIP = new Set(["node_modules", ".git", "dist", ".next", "build", "out", ".cache", "coverage"]);
      function countWsFiles(dir: string): number {
        let n = 0;
        try {
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
            n += entry.isDirectory() ? countWsFiles(path.join(dir, entry.name)) : 1;
          }
        } catch {}
        return n;
      }
      const fileCount = countWsFiles(wsDir);

      // Persist project type and build result to DB
      db.update(projectsTable)
        .set({ projectType: "app", appSourceFileCount: fileCount, appBuildSucceeded: true })
        .where(eq(projectsTable.id, projectId))
        .catch((e) => logger.warn({ err: e, projectId }, "Failed to update app build state"));

      // Sentinel port: non-null so the frontend shows the iframe, but the iframe
      // points to /api/preview/workspace/:id/ (served by this same API server).
      st.port = 1;
      st.status = "running";
      st.startedAt = new Date();
      wsSaveState(projectId, 1, undefined);
      addWsLog(st, `✓ Build complete — ${fileCount} source files · preview ready`);

      // Log to artifact gallery — version auto-computed from existing build count
      void logProjectArtifact({
        projectId,
        type: "build_output",
        title: "Build Output",
        metadata: { fileCount, builtAt: new Date().toISOString() },
        payload: {},
      });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      st.status = "error";
      st.errorMsg = msg;
      addWsLog(st, `Error: ${msg}`);
      logger.error({ err, projectId }, "Workspace dev server start failed");
    }
  })();
});

router.get("/devserver/workspace/:projectId/status", (req, res): void => {
  const projectId = Number(req.params["projectId"]);
  const st = getWsState(projectId);
  const wsDir = projectWorkspaceDir(projectId);
  const hasScaffold = existsSync(path.join(wsDir, "package.json"));
  res.json({
    status: st.status,
    port: st.port,
    logs: st.logs.slice(-50),
    errorMsg: st.errorMsg,
    hasScaffold,
    startedAt: st.startedAt ?? null,
    verifiedTargetId: st.verifiedTargetId ?? null,
    verifiedAt: st.verifiedAt ?? null,
    lastVerifiedTargetId: st.lastVerifiedTargetId ?? null,
    lastVerifiedAt: st.lastVerifiedAt ?? null,
    readiness: st.readiness,
    launchRecipe: st.launchRecipe,
  });
});

// ── Runtime event history (Phase 5A) ─────────────────────────────────────
router.get("/devserver/workspace/:projectId/events", async (req, res): Promise<void> => {
  const projectId = Number(req.params["projectId"]);
  if (!projectId) { res.status(400).json({ error: "Invalid projectId" }); return; }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const isOwner = await assertProjectOwner(projectId, userId);
  if (!isOwner) { res.status(404).json({ error: "Project not found" }); return; }
  try {
    const result = await db.execute(sql`
      SELECT id, event_type, target_id, detail, created_at
      FROM runtime_events
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC, id DESC
      LIMIT 50
    `);
    res.json({ events: result.rows });
  } catch (err) {
    logger.error({ err, projectId }, "runtime_events: fetch failed");
    res.status(500).json({ error: "Failed to fetch runtime history" });
  }
});

// ── Stop / intent-aware process termination (Phase 5B) ────────────────────
router.post("/devserver/workspace/:projectId/stop", async (req, res): Promise<void> => {
  const projectId = Number(req.params["projectId"]);
  if (!projectId) { res.status(400).json({ error: "Invalid projectId" }); return; }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const isOwner = await assertProjectOwner(projectId, userId);
  if (!isOwner) { res.status(404).json({ error: "Project not found" }); return; }

  const st = wsStates.get(projectId);
  if (st) {
    // Record intent BEFORE sending SIGTERM so the exit listener classifies
    // the outcome as intentionally-stopped rather than crashed.
    st.pendingStopReason = "user";
    st.runUserId = st.runUserId ?? userId;
    if (st.proc) {
      const pid = st.proc.pid;
      try { if (pid) process.kill(-pid, "SIGTERM"); else st.proc.kill("SIGTERM"); } catch {}
      st.proc = null;
    }
    transitionRuntime(projectId, st, {
      status: "stopped",
      eventType: "runtime_stopped",
      targetId: st.verifiedTargetId,
      detail: { reason: "user" },
    });
    st.port = null;
    st.logs = [];
    st.errorMsg = null;
    st.verifiedTargetId = null;
    st.verifiedAt = null;
    st.pendingStopReason = null;
  }
  wsDeleteState(projectId);
  res.json({ status: "stopped" });
});

// ── Server-authoritative restart (Phase 5B) ───────────────────────────────
// Browser should never orchestrate restart timing with arbitrary delays.
// This endpoint:
//   1. Sets pendingStopReason = "restart"
//   2. Terminates the current process tree (SIGTERM → bounded wait → SIGKILL)
//   3. Increments the generation counter
//   4. Reads the stored launch recipe
//   5. Fires a new /run cycle using recipe args
//
router.post("/devserver/workspace/:projectId/restart", async (req, res): Promise<void> => {
  const projectId = Number(req.params["projectId"]);
  if (!projectId) { res.status(400).json({ error: "Invalid projectId" }); return; }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const isOwner = await assertProjectOwner(projectId, userId);
  if (!isOwner) { res.status(404).json({ error: "Project not found" }); return; }

  const st = wsStates.get(projectId);
  if (!st) { res.status(409).json({ error: "No runtime to restart" }); return; }

  const recipe = st.launchRecipe;
  if (!recipe) {
    res.status(409).json({ error: "No restart recipe available. Run the app first." });
    return;
  }

  // If another run is already in progress, reject.
  if (st.status === "installing" || st.status === "starting" || st.status === "restarting") {
    res.status(409).json({ error: "A run is already in progress", status: st.status });
    return;
  }

  st.runUserId = userId;
  st.pendingStopReason = "restart";
  transitionRuntime(projectId, st, {
    status: "restarting",
    eventType: "restart_requested",
    targetId: st.verifiedTargetId ?? recipe.targetId,
    detail: { reason: "user-restart" },
  });
  addWsLog(st, "↺ Restart requested — stopping current process…");

  // Terminate and wait for clean exit (bounded)
  if (st.proc) {
    const pid = st.proc.pid;
    const dyingProc = st.proc;
    const exitPromise = new Promise<void>(resolve => dyingProc.once("exit", () => resolve()));
    try { if (pid) process.kill(-pid, "SIGTERM"); else dyingProc.kill("SIGTERM"); } catch {}
    // Wait up to 8s for clean exit, then force-kill
    const cleanExit = await Promise.race([
      exitPromise.then(() => true),
      new Promise<false>(r => setTimeout(() => r(false), 8_000)),
    ]);
    if (!cleanExit && st.proc === dyingProc) {
      try { if (pid) process.kill(-pid, "SIGKILL"); else dyingProc.kill("SIGKILL"); } catch {}
      await Promise.race([exitPromise, new Promise(r => setTimeout(r, 2_000))]);
    }
    st.proc = null;
    st.pendingStopReason = null; // consumed — exit handler will fire but runGen will mismatch
  }

  // Respond immediately — client polls /status
  res.status(202).json({ status: "restarting" });

  // Increment generation so stale callbacks from the killed process are ignored
  st.runGen = (st.runGen ?? 0) + 1;

  // Re-run using the stored recipe (proxied through the run route handler logic).
  // We do this by forwarding a synthetic /run request to the same Express handler.
  // To avoid duplicating the entire /run implementation, we mutate req.body and
  // forward via router.handle — but simpler: just re-POST /run server-side via http.
  // Actually the cleanest approach is to directly invoke the run logic via a loopback
  // call on localhost:80 so it goes through the same auth and classification path.
  const loopbackPort = OWN_PORT;
  const runPayload = JSON.stringify({
    targetId: recipe.targetId,
    env: recipe.approvedPublicEnv,
    serviceBindingIds: recipe.serviceBindingIds,
  });
  const loopReq = http.request(
    {
      hostname: "localhost",
      port: loopbackPort,
      path: `/api/devserver/workspace/${projectId}/run`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(runPayload),
        // Forward a minimal session cookie from the original request so auth passes.
        "Cookie": req.headers["cookie"] ?? "",
      },
    },
    (loopRes) => {
      loopRes.resume(); // drain response body
      if (loopRes.statusCode && loopRes.statusCode >= 400) {
        logger.warn({ projectId, statusCode: loopRes.statusCode }, "Restart loopback /run rejected");
        transitionRuntime(projectId, st, {
          status: "error",
          eventType: "runtime_error",
          targetId: recipe.targetId,
          detail: { reason: "restart-loopback-rejected", statusCode: loopRes.statusCode },
        });
        st.errorMsg = "Restart failed — the new run was rejected by the server.";
      }
    },
  );
  loopReq.on("error", (err) => {
    logger.warn({ err, projectId }, "Restart loopback /run network error");
    transitionRuntime(projectId, st, {
      status: "error",
      eventType: "runtime_error",
      targetId: recipe.targetId,
      detail: { reason: "restart-loopback-error", message: (err as Error).message },
    });
    st.errorMsg = "Restart failed — could not reach the run endpoint.";
  });
  loopReq.write(runPayload);
  loopReq.end();
});

// ── Readiness check (Phase 5C) — evaluate drift against stored snapshot ──
// Call this on workspace reopen / status restoration so readiness warnings
// appear before the user clicks Run, not after.
//
router.post("/devserver/workspace/:projectId/check-readiness", async (req, res): Promise<void> => {
  const projectId = Number(req.params["projectId"]);
  if (!projectId) { res.status(400).json({ error: "Invalid projectId" }); return; }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const isOwner = await assertProjectOwner(projectId, userId);
  if (!isOwner) { res.status(404).json({ error: "Project not found" }); return; }

  const st = wsStates.get(projectId);
  if (!st?.verificationSnapshot) {
    // No snapshot means no prior run — readiness is always "ready" (no baseline to drift from)
    res.json({ readiness: { configuration: "ready", dependencies: "ready", classification: "current" } });
    return;
  }

  // Respond immediately with current cached readiness, then recompute in background
  res.json({ readiness: st.readiness });

  const snap = st.verificationSnapshot;
  const workDir = projectWorkspaceDir(projectId);

  // Recompute structural hashes in background — updates st.readiness for next /status poll
  computeStructuralFileHashes(workDir).then((currentHashes) => {
    if (!st.verificationSnapshot) return; // snapshot cleared (new run started)

    // Dependency drift: compare all structural files, not just lockfile
    const snapHashes = snap.structuralFileHashes;
    let depDrift = false;
    for (const key of Object.keys(snapHashes)) {
      if (currentHashes[key] && currentHashes[key] !== snapHashes[key]) {
        depDrift = true;
        break;
      }
    }
    // Also check if a previously-missing lockfile now exists or vice versa
    const lockKeys = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"];
    const snapLock = lockKeys.find(k => snap.installFingerprint && snapHashes[k] === snap.installFingerprint);
    const currLock = lockKeys.find(k => currentHashes[k]);
    if (snapLock !== currLock) depDrift = true;

    if (depDrift && st.readiness.dependencies === "ready") {
      st.readiness.dependencies = "reinstall-required";
      logger.info({ projectId }, "check-readiness: dependency drift detected");
    }

    // Classification drift: re-check structural files that affect classifier behavior
    // (package.json changes can alter framework/target detection)
    if (
      (currentHashes["package.json"] && snapHashes["package.json"] && currentHashes["package.json"] !== snapHashes["package.json"]) ||
      (currentHashes["vite.config.ts"] && snapHashes["vite.config.ts"] && currentHashes["vite.config.ts"] !== snapHashes["vite.config.ts"]) ||
      (currentHashes["next.config.js"] && snapHashes["next.config.js"] && currentHashes["next.config.js"] !== snapHashes["next.config.js"])
    ) {
      if (st.readiness.classification === "current") {
        st.readiness.classification = "stale";
        logger.info({ projectId }, "check-readiness: classification drift detected");
      }
    }
  }).catch((err: unknown) => {
    logger.warn({ err, projectId }, "check-readiness: hash computation failed");
  });
});

// ── Runtime verification — run an imported target and health-check it ────────
//
// Unlike the legacy /start route (which builds and statically serves an
// Atlas-generated app), this route:
//   1. Classifies the project to locate the target's workingDirectory + startCommand
//   2. Installs deps inside that working directory
//   3. Spawns the startCommand as a live process with a free port injected
//   4. Detects the port from stdout (reusing detectPort) with a fallback probe
//   5. Marks the target verified-runnable once the port responds
//   6. The existing /proxy route then transparently forwards preview traffic
//
router.post("/devserver/workspace/:projectId/run", async (req, res): Promise<void> => {
  const projectId = Number(req.params["projectId"]);
  if (!projectId) { res.status(400).json({ error: "Invalid projectId" }); return; }

  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const isOwner = await assertProjectOwner(projectId, userId);
  if (!isOwner) { res.status(404).json({ error: "Project not found" }); return; }

  // ── Concurrency gate ─────────────────────────────────────────────────────────
  // Reserve the slot immediately — before any async DB/classify work — so a
  // concurrent second /run arriving during classification sees "installing" and
  // gets rejected. The monotonic runGen token (set below) additionally prevents
  // stale callbacks from a previous IIFE overwriting state owned by a newer run.
  const st = getWsState(projectId);
  if (st.status === "installing" || st.status === "starting" || st.status === "restarting") {
    res.status(409).json({ error: "A run is already in progress. Wait for it to complete or call /stop first.", status: st.status });
    return;
  }
  // If a previous process is still running, kill it with "replacement" intent
  // (Phase 5B) so its exit listener classifies the termination correctly.
  if (st.proc) {
    st.pendingStopReason = "replacement";
    const prevPid = st.proc.pid;
    try { if (prevPid) process.kill(-prevPid, "SIGTERM"); else st.proc.kill("SIGTERM"); } catch {}
    st.proc = null;
  }
  // Capture the authenticated userId for event logging throughout this run.
  st.runUserId = userId;
  st.pendingStopReason = null;
  // Reserve the slot synchronously — transitionRuntime with full detail fires
  // inside the async IIFE once targetId is resolved.
  st.status = "installing";

  const { targetId, env: rawUserEnv = {}, serviceBindingIds } = req.body as {
    targetId?: string;
    env?: Record<string, string>;
    serviceBindingIds?: string[];
  };

  // Load project for linkedRepo + githubToken
  const [project] = await db
    .select({ linkedRepo: projectsTable.linkedRepo, githubToken: projectsTable.githubToken })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);

  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  // Resolve linked repo and token (same pattern as classify route)
  const workspaceDir = projectWorkspaceDir(projectId);
  let linkedRepo: string | null = null;
  if (project.linkedRepo) {
    try {
      const parsed = JSON.parse(project.linkedRepo as string);
      linkedRepo = typeof parsed === "string" ? parsed : ((parsed as Record<string, unknown>).fullName as string ?? null);
    } catch {
      linkedRepo = project.linkedRepo as string;
    }
  }
  const githubToken = project.githubToken ? decryptToken(project.githubToken as string) : null;

  // Classify to find targets
  const input = await loadClassificationInput({ workspaceDir, linkedRepo, githubToken });
  if (!input) {
    st.status = "error"; st.errorMsg = "No file source available";
    res.status(422).json({
      error: "No file source available",
      detail: "Project has no cloned workspace and no linked GitHub repository with a valid token.",
    });
    return;
  }

  const report = classifyRepository(input);

  // Pick the requested target, fall back to recommended, fall back to first
  const chosenId = targetId ?? report.recommendation?.targetId;
  const target = report.targets.find(t => t.id === chosenId) ?? report.targets[0];
  if (!target) {
    st.status = "error"; st.errorMsg = "No runnable targets found";
    res.status(422).json({ error: "No runnable targets found in this repository" });
    return;
  }
  if (target.status === "unsupported" || target.status === "likely-inactive") {
    st.status = "error"; st.errorMsg = `Target "${target.id}" cannot be run (status: ${target.status})`;
    res.status(422).json({
      error: st.errorMsg,
      detail: target.inactivityReasons?.join("; ") ?? "Target was classified as not runnable.",
    });
    return;
  }

  // ── Env var allowlist ────────────────────────────────────────────────────────
  // Only accept variable names that the classifier declared for this target.
  // The server enforces this — the client cannot override PATH, HOME, PORT, etc.
  const allowedEnvKeys = new Set(target.environmentVariables);

  // Collect the set of service IDs the target actually declares as requirements.
  // Used below to reject bindings for services the target does not need.
  const declaredServiceIds = new Set(
    (target.externalServices ?? []).map(s => s.toLowerCase().trim()),
  );

  // Phase 1: user-supplied env vars (lower precedence than service bindings).
  const safeUserEnv: Record<string, string> = {};
  const rejectedEnvKeys: string[] = [];
  for (const [k, v] of Object.entries(rawUserEnv)) {
    if (typeof v !== "string") continue;
    if (allowedEnvKeys.has(k)) {
      safeUserEnv[k] = v;
    } else {
      rejectedEnvKeys.push(k);
    }
  }
  if (rejectedEnvKeys.length > 0) {
    logger.warn({ projectId, targetId: target.id, rejectedEnvKeys }, "Run route dropped undeclared env keys");
  }

  // ── Service binding injection ────────────────────────────────────────────────
  // Phase 2: service bindings (higher precedence than user-supplied values).
  // Each bindingId is triple-verified: project_id + user_id must match, revoked_at
  // must be NULL. Secrets are decrypted in-process — they never appear in HTTP
  // request/response bodies or log output (redacted below).
  // Only env vars the classifier declared in allowedEnvKeys are injected.
  // Bindings whose service_id does not match a declared target requirement are rejected.
  const resolvedBindingEnv: Record<string, string> = {};
  if (Array.isArray(serviceBindingIds) && serviceBindingIds.length > 0) {
    const uniqueIds = [...new Set(
      serviceBindingIds.filter((id): id is string => typeof id === "string"),
    )].slice(0, 20); // cap defensively
    for (const bindingId of uniqueIds) {
      try {
        const rows = await db.execute(sql`
          SELECT service_id, provision_mode, encrypted_secrets, env_var_names
          FROM service_bindings
          WHERE id = ${bindingId}
            AND project_id = ${projectId}
            AND user_id = ${userId}
            AND revoked_at IS NULL
        `);
        const binding = rows.rows[0] as {
          service_id: string;
          provision_mode: string;
          encrypted_secrets: string | null;
          env_var_names: string[];
        } | undefined;
        // Identical rejection for not-found, cross-project, cross-user, and revoked.
        // The response does not distinguish between these cases.
        if (!binding) {
          logger.warn({ bindingId, projectId }, "Run route: binding not found, not owned, or revoked — skipping");
          continue;
        }
        // Binding-target compatibility: the binding's service must be one the target declared.
        // Prevents a binding for ServiceA from being injected into a target that only needs ServiceB.
        if (declaredServiceIds.size > 0 && !declaredServiceIds.has(binding.service_id)) {
          logger.warn({ bindingId, serviceId: binding.service_id, targetId: target.id },
            "Run route: binding service_id not in target's declared externalServices — skipping");
          continue;
        }
        if (!binding.encrypted_secrets) continue;
        // decryptBinding returns null on AES-GCM auth failure (tampered ciphertext).
        // We log only metadata — never the ciphertext, key material, or env var values.
        const plaintext = decryptBinding(binding.encrypted_secrets);
        if (plaintext === null) {
          logger.warn({ bindingId, serviceId: binding.service_id },
            "Run route: binding decrypt failed (tampered or key mismatch) — skipping");
          continue;
        }
        let secretMap: Record<string, string> = {};
        try {
          secretMap = JSON.parse(plaintext) as Record<string, string>;
        } catch {
          logger.warn({ bindingId, serviceId: binding.service_id },
            "Run route: binding payload not valid JSON — skipping");
          continue;
        }
        let injected = 0;
        const overriddenKeys: string[] = [];
        for (const [k, v] of Object.entries(secretMap)) {
          if (typeof v !== "string") continue;
          // Only inject vars the classifier declared — preserves the allowlist invariant
          if (allowedEnvKeys.has(k)) {
            if (k in safeUserEnv) {
              // Binding wins over user-supplied value for the same key.
              // Log the key name only — never either value.
              overriddenKeys.push(k);
            }
            resolvedBindingEnv[k] = v;
            injected++;
          }
        }
        if (overriddenKeys.length > 0) {
          logger.warn({ bindingId, serviceId: binding.service_id, overriddenKeys },
            "Run route: service binding overrides user-supplied env var(s) — binding wins");
        }
        logger.info({ bindingId, serviceId: binding.service_id, injected },
          "Run route: injected service binding env vars");
      } catch (err) {
        logger.warn({ err, bindingId, projectId }, "Run route: binding resolution error — skipping");
      }
    }
  }

  // ── Final env assembly ───────────────────────────────────────────────────────
  // Explicit precedence order — no accidental spread ordering:
  //   1. User-supplied vars (classifier-approved, lower precedence)
  //   2. Service binding vars (server-resolved, higher precedence — override user-supplied)
  // Protected runtime keys (PORT, HOST, PATH, HOME, etc.) are set at spawn time and
  // are never in safeUserEnv or resolvedBindingEnv because they are not in allowedEnvKeys.
  const safeEnv: Record<string, string> = {
    ...safeUserEnv,
    ...resolvedBindingEnv, // bindings win on conflict
  };

  // ── Secret scrubber ──────────────────────────────────────────────────────────
  // Replaces accepted env values (≥8 chars) in process output before logging.
  // Prevents DATABASE_URL, auth tokens, etc. from appearing in the status log.
  // Runs AFTER binding injection so binding-provided secrets are also redacted.
  const redactValues = Object.values(safeEnv).filter(v => v.length >= 8);
  function scrubLine(raw: string): string {
    if (redactValues.length === 0) return raw;
    let out = raw;
    for (const val of redactValues) {
      if (out.includes(val)) out = out.replaceAll(val, "[REDACTED]");
    }
    return out;
  }

  // status is already "installing" (set at the gate); reconfirm and reset fields
  // (proc was already cleared at the concurrency gate — no second kill needed here)
  st.port = null;
  st.logs = [`Runtime verification: ${target.id} (${target.framework})`];
  st.errorMsg = null;
  st.verifiedTargetId = null;
  st.verifiedAt = null;
  st.startedAt = null;
  // Increment generation token — all callbacks below close over myGen and check
  // it before mutating state, preventing stale IIFEs from poisoning newer runs.
  st.runGen = (st.runGen ?? 0) + 1;
  const myGen = st.runGen;

  res.json({ status: st.status, targetId: target.id });

  (async () => {
    try {
      // Resolve the working directory for this target
      const workDir = (target.workingDirectory && target.workingDirectory !== ".")
        ? path.join(workspaceDir, target.workingDirectory)
        : workspaceDir;

      // ── Path traversal guard ─────────────────────────────────────────────────
      // workDir must be the workspace root or a subdirectory of it.
      // target.workingDirectory comes from the classifier (not client input),
      // but validate defensively against any future code path changes.
      if (workDir !== workspaceDir && !workDir.startsWith(workspaceDir + path.sep)) {
        throw new Error("Target working directory escapes the project workspace. Aborting.");
      }

      // ── 5A: Emit install_started event now that we have the resolved targetId ─
      transitionRuntime(projectId, st, {
        status: "installing",
        eventType: "install_started",
        targetId: target.id,
        detail: { framework: target.framework, workingDirectory: target.workingDirectory },
      });

      // ── 5C: Drift detection ──────────────────────────────────────────────────
      // Compare current run configuration against the last verified snapshot.
      // Updates st.readiness to signal config-changed or reinstall-required
      // before the install step so forced reinstalls can happen immediately.
      if (st.verificationSnapshot) {
        const snap = st.verificationSnapshot;
        const currentClassHash = computeClassificationHash(target);
        const currentEnvKeys = [...Object.keys(safeEnv)].sort().join(",");
        const snapEnvKeys = [...snap.requiredEnvKeys].sort().join(",");
        const currentBindingIds = (serviceBindingIds ?? []).slice().sort().join(",");
        const snapBindingIds = snap.serviceBindingIds.slice().sort().join(",");

        if (currentClassHash !== snap.classificationHash) {
          st.readiness.classification = "stale";
          transitionRuntime(projectId, st, {
            status: "installing",
            eventType: "drift_detected",
            targetId: target.id,
            detail: { type: "classification", prev: snap.classificationHash, curr: currentClassHash },
          });
          addWsLog(st, "⚠ Classifier target changed since last verified run");
        }
        if (currentEnvKeys !== snapEnvKeys || currentBindingIds !== snapBindingIds) {
          st.readiness.configuration = "changed";
          transitionRuntime(projectId, st, {
            status: "installing",
            eventType: "drift_detected",
            targetId: target.id,
            detail: { type: "configuration" },
          });
          addWsLog(st, "⚠ Configuration changed since last verified run");
        }
        // Structural file hashes already in snapshot — check if lockfile changed
        const snapLockHash = snap.installFingerprint;
        if (snapLockHash) {
          const currentHashes = await computeStructuralFileHashes(workDir);
          const currentLockHash = currentHashes["pnpm-lock.yaml"] ?? currentHashes["package-lock.json"] ?? currentHashes["yarn.lock"] ?? "";
          if (currentLockHash && currentLockHash !== snapLockHash) {
            st.readiness.dependencies = "reinstall-required";
            transitionRuntime(projectId, st, {
              status: "installing",
              eventType: "reinstall_required",
              targetId: target.id,
              detail: { reason: "lockfile-changed" },
            });
            addWsLog(st, "⚠ Lockfile changed — reinstalling dependencies");
          }
        }
      } else {
        // No snapshot yet — first run, readiness is clean
        st.readiness = { configuration: "ready", dependencies: "ready", classification: "current" };
      }

      // ── 1. Install dependencies ──────────────────────────────────────────────
      //
      // For monorepo sub-targets (workDir ≠ workspaceDir), install must run at
      // the repo root so workspace symlinks resolve correctly. For standalone
      // targets (workingDirectory is "."), install directly in workDir.
      const installDir = (workDir !== workspaceDir) ? workspaceDir : workDir;
      const nmPath = path.join(installDir, "node_modules");
      const pkgJsonPath = path.join(installDir, "package.json");
      let needsInstall = !existsSync(nmPath);
      if (!needsInstall) {
        try {
          const [pkgStat, nmStat] = await Promise.all([
            fsPromises.stat(pkgJsonPath),
            fsPromises.stat(nmPath),
          ]);
          if (pkgStat.mtimeMs > nmStat.mtimeMs) {
            needsInstall = true;
            addWsLog(st, "package.json updated — reinstalling dependencies…");
          }
        } catch { /* stat failure — proceed without reinstall */ }
      }

      if (needsInstall) {
        if (st.runGen !== myGen) return;
        // Use the classified installCommand directly — it already encodes the
        // right package manager and flags (e.g. "pnpm install", "npm install").
        const installCmd = target.installCommand || `${detectPackageManager(installDir)} install`;
        addWsLog(st, `Installing: ${installCmd}…`);

        // Race install against a 5-minute hard timeout
        const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
        const installResult = await Promise.race([
          new Promise<{ ok: boolean; output: string }>((resolve) => {
            const chunks: string[] = [];
            const installProc = spawn(installCmd, [], {
              cwd: installDir, shell: true,
              env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
            });
            const onInstData = (d: Buffer) => {
              const s = d.toString().slice(0, 2048);
              chunks.push(s);
              addWsLog(st, s);
            };
            installProc.stdout?.on("data", onInstData);
            installProc.stderr?.on("data", onInstData);
            installProc.on("exit", (code) => resolve({ ok: code === 0, output: chunks.join("") }));
            installProc.on("error", (e) => resolve({ ok: false, output: e.message }));
          }),
          new Promise<{ ok: boolean; output: string }>((resolve) =>
            setTimeout(() => resolve({ ok: false, output: "Installation timed out after 5 minutes" }), INSTALL_TIMEOUT_MS)
          ),
        ]);

        if (st.runGen !== myGen) return;
        if (!installResult.ok) {
          throw new Error(`Dependency install failed.\nLast output:\n${installResult.output.slice(-600)}`);
        }
        addWsLog(st, "✓ Dependencies installed");
        // Readiness: dependencies are fresh after a completed install
        st.readiness.dependencies = "ready";
        transitionRuntime(projectId, st, {
          status: "installing",
          eventType: "install_completed",
          targetId: target.id,
          detail: {},
        });
      }

      if (st.runGen !== myGen) return;

      // ── 2. Allocate a port and start the dev server ──────────────────────────
      transitionRuntime(projectId, st, {
        status: "starting",
        eventType: "start_requested",
        targetId: target.id,
        detail: { framework: target.framework },
      });
      const port = await allocateFreePort();

      // Build the command string — Vite needs --host + --port to bind to the
      // allocated port and accept proxied traffic from outside localhost.
      // Only server-controlled values (port number from allocateFreePort) enter
      // the command string — no client-provided strings are interpolated here.
      const isVite = /vite/i.test(target.framework) || target.startCommand.toLowerCase().includes("vite");
      const rawCmd = isVite
        ? `${target.startCommand} -- --host 0.0.0.0 --port ${port}`
        : target.startCommand;

      addWsLog(st, `Starting: ${rawCmd} (port ${port})…`);

      // Spawn with detached:true so the child leads its own process group.
      // On kill we send SIGTERM to -pid (the entire group) rather than just
      // the shell wrapper, ensuring child processes (e.g. Node) also exit.
      const proc = spawn(rawCmd, [], {
        cwd: workDir,
        shell: true,
        detached: true,
        env: {
          // Deliberate precedence order — no accidental spread:
          //   1. System base environment (PATH, HOME, etc.)
          //   2. Forced/sanitized overrides
          //   3. Classifier-approved user env (lower precedence)
          //   4. Server-resolved binding env (higher precedence — overrides user-supplied)
          //   5. Protected runtime keys that must never be overridden (PORT, HOST)
          ...process.env,
          FORCE_COLOR: "0",
          NO_COLOR: "1",
          ...safeEnv,           // = safeUserEnv merged with resolvedBindingEnv (bindings win)
          PORT: String(port),   // always server-controlled — must come after safeEnv
          HOST: "0.0.0.0",      // always server-controlled — must come after safeEnv
        },
      });
      st.proc = proc;

      // ── markVerified: called once when the port accepts an HTTP connection ─────
      // Status transitions synchronously; snapshot computation is fire-and-forget
      // so it never delays the "running" signal the frontend polls for.
      const markVerified = (livePort: number) => {
        if (st.runGen !== myGen) return;
        clearTimeout(portFallbackTimer);
        st.port = livePort;
        st.startedAt = new Date();
        st.verifiedTargetId = target.id;
        st.verifiedAt = new Date();
        st.lastVerifiedTargetId = target.id;
        st.lastVerifiedAt = st.verifiedAt;
        st.readiness.configuration = "ready";
        st.readiness.classification = "current";
        transitionRuntime(projectId, st, {
          status: "running",
          eventType: "runtime_connected",
          targetId: target.id,
          detail: { port: livePort, framework: target.framework },
        });
        addWsLog(st, `✓ Connected — ${target.id} accepted HTTP on port ${livePort} · ${target.framework}`);
        logger.info({ projectId, port: livePort, targetId: target.id, framework: target.framework }, "Runtime verification complete");
        // Build and store the verification snapshot + launch recipe asynchronously (Phase 5C).
        // Does not block the "running" signal — fires after status is already set.
        computeStructuralFileHashes(workDir).then((structuralHashes) => {
          if (st.runGen !== myGen || st.verifiedTargetId !== target.id) return;
          const classificationHash = computeClassificationHash(target);
          const installFingerprint =
            structuralHashes["pnpm-lock.yaml"] ??
            structuralHashes["package-lock.json"] ??
            structuralHashes["yarn.lock"] ??
            "";
          st.verificationSnapshot = {
            targetId: target.id,
            classificationHash,
            requiredEnvKeys: Object.keys(safeEnv),
            serviceBindingIds: serviceBindingIds ?? [],
            installFingerprint,
            structuralFileHashes: structuralHashes,
            verifiedAt: (st.verifiedAt ?? new Date()).toISOString(),
          };
          // Safe restart recipe — no secrets; binding IDs used for server-resolved creds.
          // approvedPublicEnv stores only env var names the classifier declared
          // for this target (values already accepted by the allowlist filter).
          st.launchRecipe = {
            targetId: target.id,
            serviceBindingIds: serviceBindingIds ?? [],
            approvedPublicEnv: { ...safeEnv },
            classificationHash,
            installFingerprint,
            updatedAt: new Date().toISOString(),
          };
          // Persist recipe alongside port/pid so it survives API server restarts.
          wsSaveState(projectId, livePort, proc.pid ?? undefined, target.id, target.id, st.launchRecipe);
        }).catch((err: unknown) => {
          logger.warn({ err, projectId }, "markVerified: snapshot/recipe computation failed — recipe not persisted");
        });
      };

      // ── 3. Port detection: watch stdout, fall back to probing ────────────────
      const portFallbackTimer = setTimeout(async () => {
        if (st.runGen !== myGen || st.status !== "starting" || !st.proc) return;
        addWsLog(st, "Port not announced in stdout — probing common ports…");
        const found = await pollForPort(
          [port, 5173, 3000, 4173, 8000, 4000].filter(p => p !== OWN_PORT)
        );
        if (st.runGen !== myGen) return;
        if (found && st.status === "starting") {
          markVerified(found);
        } else if (st.status === "starting") {
          // One more attempt after an additional 30s
          setTimeout(async () => {
            if (st.runGen !== myGen || st.status !== "starting") return;
            const found2 = await pollForPort([port, 3000, 5173].filter(p => p !== OWN_PORT));
            if (found2) {
              markVerified(found2);
            } else {
              const timeoutMsg = "Dev server started but no port responded after 75s. Check if required environment variables are missing (e.g. DATABASE_URL, auth keys).";
              transitionRuntime(projectId, st, {
                status: "error",
                eventType: "runtime_error",
                targetId: target.id,
                detail: { reason: "port-timeout", durationMs: 75_000 },
              });
              st.errorMsg = timeoutMsg;
              addWsLog(st, "✗ No running port found after timeout");
            }
          }, 30_000);
        }
      }, 45_000);

      const onData = (d: Buffer) => {
        if (st.runGen !== myGen) return;
        const line = scrubLine(d.toString());
        addWsLog(st, line);
        if (st.status !== "running") {
          const detected = detectPort(line);
          if (detected) markVerified(detected);
        }
      };
      proc.stdout?.on("data", onData);
      proc.stderr?.on("data", onData);

      // ── 5B: Intent-aware exit handler ─────────────────────────────────────────
      // The primary question is: did Atlas request this process to stop?
      // Exit code and signal are supporting evidence, not the primary signal.
      proc.on("exit", (code, signal) => {
        if (st.runGen !== myGen) return;
        clearTimeout(portFallbackTimer);
        const reason = st.pendingStopReason;
        st.pendingStopReason = null;
        // Preserve historical verification before clearing current state
        if (st.verifiedTargetId) {
          st.lastVerifiedTargetId = st.verifiedTargetId;
          st.lastVerifiedAt = st.verifiedAt;
        }

        if (reason === "user") {
          // Explicit user-initiated stop — always "stopped"
          transitionRuntime(projectId, st, {
            status: "stopped",
            eventType: "runtime_stopped",
            targetId: target.id,
            detail: { exitCode: code, signal, reason: "user" },
          });
          addWsLog(st, "■ Stopped by user");
          wsDeleteState(projectId);
        } else if (reason === "restart") {
          // Atlas-initiated restart — new run IIFE takes over; leave state to it
          addWsLog(st, "↺ Restarting…");
        } else if (reason === "replacement") {
          // Old process killed because a new /run call was made — new IIFE owns state
          // No log needed — new run will emit its own events
        } else {
          // No intent recorded — process exited on its own.
          // Distinguish startup failure (never connected) from runtime crash (was connected).
          //   - wasConnected = true  → crash: "App crashed"
          //   - wasConnected = false → error: "App could not start"
          // A process that exits with code 0 without having connected is also a startup error.
          const wasConnected = st.verifiedTargetId === target.id;
          if (wasConnected) {
            const crashMsg = signal
              ? `App crashed (signal ${signal}). Check logs for details.`
              : `App exited unexpectedly (code ${code ?? "unknown"}). Check logs for details.`;
            transitionRuntime(projectId, st, {
              status: "crashed",
              eventType: "runtime_crashed",
              targetId: target.id,
              detail: { exitCode: code, signal, wasConnected: true },
            });
            st.errorMsg = crashMsg;
            addWsLog(st, `✗ Crashed (${signal ?? `code ${code}`})`);
          } else {
            // Never reached the connected state — startup failure, not a crash.
            const errMsg = signal
              ? `App exited before accepting connections (signal ${signal}).`
              : code === 0
                ? "App exited cleanly before accepting connections. Missing start script?"
                : `App failed to start (exit code ${code ?? "unknown"}).`;
            transitionRuntime(projectId, st, {
              status: "error",
              eventType: "runtime_error",
              targetId: target.id,
              detail: { exitCode: code, signal, wasConnected: false, reason: "startup-failure" },
            });
            st.errorMsg = errMsg;
            addWsLog(st, `✗ Startup failure (${signal ?? `code ${code}`})`);
          }
          wsDeleteState(projectId);
        }

        st.verifiedTargetId = null;
        st.verifiedAt = null;
        st.proc = null;
      });

    } catch (err: unknown) {
      if (st.runGen !== myGen) return;
      const msg = err instanceof Error ? err.message : "Unknown error";
      transitionRuntime(projectId, st, {
        status: "error",
        eventType: "runtime_error",
        targetId: target?.id ?? null,
        detail: { message: msg.slice(0, 500) },
      });
      st.errorMsg = msg;
      addWsLog(st, `Error: ${msg}`);
      logger.error({ err, projectId }, "Runtime verification failed");
    }
  })();
});

router.use("/devserver/workspace/:projectId/proxy", (req, res): void => {
  const projectId = Number(req.params["projectId"]);
  const st = wsStates.get(projectId);
  if (!st?.port) { res.status(503).json({ error: "Dev server not running" }); return; }
  const wsProxyBase = `/api/devserver/workspace/${projectId}/proxy`;
  proxyToPort(st.port, wsProxyBase, req, res);
});

export default router;
