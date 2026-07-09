/**
 * Closed-Loop Verification — Phase 3.
 *
 * Runs after a batch of generated files lands in a project workspace
 * (agent-loop tool writes, or a chat-mode "apply" from the frontend).
 * Produces a single report Atlas (and the human) can trust before a
 * build is called "done".
 *
 * Six checks, matched 1:1 to the Phase 3 requirements:
 *   1. manifestCheck      — every file referenced by package.json scripts / imports exists
 *   2. installAndBuild    — actually run install + build (+ typecheck if present)
 *   3. truncationCheck     — flag files that look cut off mid-generation
 *   4. envChecklist        — collect every process.env.X the generated code needs
 *   5. seedDataCheck       — production-grade builds must ship minimal seed data
 *   6. gate()              — combines 1-5 into a single pass/fail decision
 */

import fsPromises from "fs/promises";
import fsNode from "fs";
import path from "path";
import { execFile } from "child_process";

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "dist", ".next", "__pycache__",
  ".cache", "coverage", ".turbo", "build", ".svelte-kit",
  ".vercel", ".output", "out",
]);

const SOURCE_EXT_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEXT_EXT_RE = /\.(ts|tsx|js|jsx|mjs|cjs|json|sql|css|html)$/;

export interface VerificationIssue {
  severity: "blocking" | "warning";
  check: "manifest" | "build" | "truncation" | "env" | "seed";
  path?: string;
  message: string;
}

export interface VerificationReport {
  passed: boolean;
  issues: VerificationIssue[];
  envChecklist: string[];
  seedDataFound: boolean;
  buildRan: boolean;
  buildOutputTail?: string;
  filesScanned: number;
  durationMs: number;
}

async function walk(dir: string, base = dir): Promise<string[]> {
  let entries: fsNode.Dirent[];
  try {
    entries = await fsPromises.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full, base)));
    } else {
      out.push(path.relative(base, full));
    }
  }
  return out;
}

function existsCaseSensitive(workspaceDir: string, relPath: string): boolean {
  const candidates = [relPath, `${relPath}.ts`, `${relPath}.tsx`, `${relPath}.js`, `${relPath}/index.ts`, `${relPath}/index.tsx`];
  return candidates.some((c) => fsNode.existsSync(path.join(workspaceDir, c)));
}

/**
 * 1. Manifest check — every file a package.json script or a source import
 * references must actually exist on disk. This is exactly the class of bug
 * (root package.json pointing at a `client/vite.config.ts` that was never
 * generated) found in the Budgeting benchmark.
 */
export async function manifestCheck(workspaceDir: string, files: string[]): Promise<VerificationIssue[]> {
  const issues: VerificationIssue[] = [];

  // 1a. package.json scripts referencing --config <path> or explicit file args
  const pkgFiles = files.filter((f) => path.basename(f) === "package.json");
  for (const pkgFile of pkgFiles) {
    let pkg: any;
    try {
      pkg = JSON.parse(await fsPromises.readFile(path.join(workspaceDir, pkgFile), "utf-8"));
    } catch {
      issues.push({ severity: "blocking", check: "manifest", path: pkgFile, message: "package.json is not valid JSON" });
      continue;
    }
    const scripts: Record<string, string> = pkg.scripts ?? {};
    for (const [scriptName, cmd] of Object.entries(scripts)) {
      const configMatch = String(cmd).match(/--config\s+(\S+)/);
      if (configMatch) {
        const refPath = configMatch[1];
        if (!fsNode.existsSync(path.join(workspaceDir, refPath))) {
          issues.push({
            severity: "blocking",
            check: "manifest",
            path: refPath,
            message: `package.json script "${scriptName}" references ${refPath}, which was never generated`,
          });
        }
      }
    }
  }

  // 1b. Relative imports in source files must resolve
  const sourceFiles = files.filter((f) => SOURCE_EXT_RE.test(f));
  for (const relFile of sourceFiles) {
    let content: string;
    try {
      content = await fsPromises.readFile(path.join(workspaceDir, relFile), "utf-8");
    } catch {
      continue;
    }
    const importRe = /(?:import[^'"]*from\s+|require\()\s*['"](\.[^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = importRe.exec(content))) {
      const importPath = match[1];
      const resolved = path.join(path.dirname(relFile), importPath);
      if (!existsCaseSensitive(workspaceDir, resolved)) {
        issues.push({
          severity: "blocking",
          check: "manifest",
          path: relFile,
          message: `imports "${importPath}", which does not resolve to a generated file`,
        });
      }
    }
  }

  return issues;
}

/**
 * 2. Build/test run — actually install + build (+ typecheck) the generated
 * project. This is the step Atlas skipped entirely in the Budgeting
 * benchmark: it never found out its own output was unrunnable.
 */
export async function installAndBuild(workspaceDir: string, timeoutMs = 90_000): Promise<{ ok: boolean; ran: boolean; outputTail: string }> {
  const hasPackageJson = fsNode.existsSync(path.join(workspaceDir, "package.json"));
  if (!hasPackageJson) {
    return { ok: false, ran: false, outputTail: "No root package.json — nothing to install/build." };
  }

  const run = (cmd: string, args: string[], extraEnv?: Record<string, string>): Promise<{ ok: boolean; output: string }> =>
    new Promise((resolve) => {
      execFile(
        cmd,
        args,
        { cwd: workspaceDir, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, ...extraEnv } },
        (err, stdout, stderr) => {
          const output = `${stdout}\n${stderr}`.trim();
          resolve({ ok: !err, output });
        },
      );
    });

  const install = await run("npm", ["install", "--legacy-peer-deps"]);
  if (!install.ok) {
    return { ok: false, ran: true, outputTail: `install failed:\n${install.output.slice(-4000)}` };
  }

  let pkg: any = {};
  try {
    pkg = JSON.parse(await fsPromises.readFile(path.join(workspaceDir, "package.json"), "utf-8"));
  } catch { /* handled below */ }
  const scripts: Record<string, string> = pkg.scripts ?? {};

  const combinedOutput: string[] = [install.output];
  let ok = true;

  if (scripts.typecheck) {
    const tc = await run("npm", ["run", "typecheck"]);
    combinedOutput.push(tc.output);
    ok = ok && tc.ok;
  }

  if (scripts.build) {
    const build = await run("npm", ["run", "build"], { NODE_ENV: "production" });
    combinedOutput.push(build.output);
    ok = ok && build.ok;
  } else if (!scripts.typecheck) {
    combinedOutput.push("No build or typecheck script found in package.json — cannot verify the app runs.");
    ok = false;
  }

  return { ok, ran: true, outputTail: combinedOutput.join("\n---\n").slice(-6000) };
}

/**
 * 3. Truncation detection — flag files that look like a mid-generation cutoff
 * (unbalanced brackets/braces/parens, or an unterminated string) so they can
 * be flagged for regeneration instead of silently shipped incomplete.
 */
export async function truncationCheck(workspaceDir: string, files: string[]): Promise<VerificationIssue[]> {
  const issues: VerificationIssue[] = [];
  const pairs: Array<[string, string]> = [["{", "}"], ["(", ")"], ["[", "]"]];

  for (const relFile of files.filter((f) => SOURCE_EXT_RE.test(f))) {
    let content: string;
    try {
      content = await fsPromises.readFile(path.join(workspaceDir, relFile), "utf-8");
    } catch {
      continue;
    }
    if (content.trim().length === 0) continue;

    for (const [open, close] of pairs) {
      const openCount = content.split(open).length - 1;
      const closeCount = content.split(close).length - 1;
      if (openCount !== closeCount) {
        issues.push({
          severity: "blocking",
          check: "truncation",
          path: relFile,
          message: `unbalanced "${open}"/"${close}" (${openCount} vs ${closeCount}) — file likely truncated mid-generation`,
        });
        break;
      }
    }

    const trimmedEnd = content.trimEnd();
    const lastChar = trimmedEnd.slice(-1);
    const looksAbrupt = /[,{(\[:]$/.test(trimmedEnd) || /=>\s*$/.test(trimmedEnd);
    if (looksAbrupt) {
      issues.push({
        severity: "blocking",
        check: "truncation",
        path: relFile,
        message: `file ends abruptly with "${lastChar}" — looks cut off, needs regeneration`,
      });
    }
  }

  return issues;
}

/**
 * 4. Environment checklist — collect every process.env.X referenced by
 * generated server code so it can be surfaced to the user as required setup,
 * instead of the silent "figure it out yourself" gap found in the benchmark.
 */
export async function envChecklist(workspaceDir: string, files: string[]): Promise<string[]> {
  const found = new Set<string>();
  const envRe = /process\.env\.([A-Z0-9_]+)/g;
  for (const relFile of files.filter((f) => SOURCE_EXT_RE.test(f))) {
    let content: string;
    try {
      content = await fsPromises.readFile(path.join(workspaceDir, relFile), "utf-8");
    } catch {
      continue;
    }
    let match: RegExpExecArray | null;
    while ((match = envRe.exec(content))) {
      found.add(match[1]);
    }
  }
  return Array.from(found).sort();
}

/**
 * 5. Seed/test data check — production-grade benchmarks must ship minimal
 * seed data (beyond schema-only migrations), so a first run isn't an empty
 * shell with nothing to demo.
 */
export async function seedDataCheck(workspaceDir: string, files: string[]): Promise<{ found: boolean; issue?: VerificationIssue }> {
  const seedFiles = files.filter((f) => /seed/i.test(path.basename(f)));
  const migrationFiles = files.filter((f) => /migrations?[\\/]/i.test(f) && f.endsWith(".sql"));

  let insertCount = 0;
  for (const f of [...seedFiles, ...migrationFiles]) {
    try {
      const content = await fsPromises.readFile(path.join(workspaceDir, f), "utf-8");
      insertCount += (content.match(/\binsert\s+into\b/gi) ?? []).length;
    } catch { /* ignore */ }
  }

  if (insertCount === 0) {
    return {
      found: false,
      issue: {
        severity: "warning",
        check: "seed",
        message: "No seed data found (no seed script and no INSERT statements in migrations) — first run will show an empty app.",
      },
    };
  }
  return { found: true };
}

/**
 * 6. Completion gate — run all checks and decide pass/fail. A build cannot
 * be reported "done" while `passed` is false; blocking issues must be
 * surfaced verbatim to the user/model instead.
 */
export async function runClosedLoopVerification(workspaceDir: string): Promise<VerificationReport> {
  const startedAt = Date.now();
  const allFiles = (await walk(workspaceDir)).filter((f) => TEXT_EXT_RE.test(f) || path.basename(f) === "package.json");

  const [manifestIssues, truncationIssues, env, seed] = await Promise.all([
    manifestCheck(workspaceDir, allFiles),
    truncationCheck(workspaceDir, allFiles),
    envChecklist(workspaceDir, allFiles),
    seedDataCheck(workspaceDir, allFiles),
  ]);

  const issues: VerificationIssue[] = [...manifestIssues, ...truncationIssues];
  if (seed.issue) issues.push(seed.issue);

  // Only attempt the (slow) install+build if there's no known-fatal manifest
  // problem — no point installing against a project we already know is
  // missing a referenced file.
  let buildRan = false;
  let buildOutputTail: string | undefined;
  if (manifestIssues.length === 0) {
    const build = await installAndBuild(workspaceDir);
    buildRan = build.ran;
    buildOutputTail = build.outputTail;
    if (build.ran && !build.ok) {
      issues.push({ severity: "blocking", check: "build", message: `install/build/typecheck failed:\n${build.outputTail}` });
    } else if (!build.ran) {
      issues.push({ severity: "warning", check: "build", message: build.outputTail });
    }
  } else {
    issues.push({
      severity: "warning",
      check: "build",
      message: "Skipped install/build — manifest check already found missing referenced files.",
    });
  }

  const passed = !issues.some((i) => i.severity === "blocking");

  return {
    passed,
    issues,
    envChecklist: env,
    seedDataFound: seed.found,
    buildRan,
    buildOutputTail,
    filesScanned: allFiles.length,
    durationMs: Date.now() - startedAt,
  };
}

/** Render a verification report as plain text for a chat response / build log. */
export function formatVerificationReport(report: VerificationReport): string {
  const lines: string[] = [];
  lines.push(report.passed ? "✅ Verification passed." : "❌ Verification FAILED — this build is not done.");
  lines.push(`Scanned ${report.filesScanned} files in ${Math.round(report.durationMs / 1000)}s.`);

  const blocking = report.issues.filter((i) => i.severity === "blocking");
  const warnings = report.issues.filter((i) => i.severity === "warning");

  if (blocking.length) {
    lines.push("", "Blocking issues:");
    for (const i of blocking) lines.push(`  - [${i.check}]${i.path ? ` ${i.path}:` : ""} ${i.message}`);
  }
  if (warnings.length) {
    lines.push("", "Warnings:");
    for (const i of warnings) lines.push(`  - [${i.check}]${i.path ? ` ${i.path}:` : ""} ${i.message}`);
  }
  if (report.envChecklist.length) {
    lines.push("", "Required environment variables:");
    for (const v of report.envChecklist) lines.push(`  - ${v}`);
  }
  lines.push("", report.seedDataFound ? "Seed data: present." : "Seed data: MISSING.");
  return lines.join("\n");
}
