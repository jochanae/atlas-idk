import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";

export type VerifyKind = "typecheck" | "test" | "lint" | "build";

const MAX_DURATION_MS = 180_000;
const ANSI_RE = /\x1B\[[0-9;]*m/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolveVerifyCommand(
  workspaceDir: string,
  kind: VerifyKind,
): Promise<{ bin: string; args: string[] }> {
  const pkgPath = join(workspaceDir, "package.json");
  const hasPkg = await fileExists(pkgPath);

  if (kind === "typecheck") {
    if (await fileExists(join(workspaceDir, "node_modules/.bin/tsgo"))) {
      return { bin: "bunx", args: ["tsgo", "--noEmit"] };
    }
    if (await fileExists(join(workspaceDir, "node_modules/.bin/tsc"))) {
      return { bin: "bunx", args: ["tsc", "--noEmit"] };
    }
    return { bin: "tsc", args: ["--noEmit"] };
  }

  if (kind === "test") {
    return { bin: "bunx", args: ["vitest", "run", "--reporter=default"] };
  }

  if (kind === "lint") {
    if (hasPkg) {
      try {
        const pkg = JSON.parse(await (await import("node:fs/promises")).readFile(pkgPath, "utf8")) as {
          scripts?: Record<string, string>;
        };
        if (pkg.scripts?.lint) return { bin: "bun", args: ["run", "lint"] };
      } catch { /* fall through */ }
    }
    return { bin: "bunx", args: ["eslint", ".", "--max-warnings=0"] };
  }

  if (hasPkg) {
    try {
      const pkg = JSON.parse(await (await import("node:fs/promises")).readFile(pkgPath, "utf8")) as {
        scripts?: Record<string, string>;
      };
      if (pkg.scripts?.build) return { bin: "bun", args: ["run", "build"] };
    } catch { /* fall through */ }
  }
  return { bin: "bun", args: ["run", "build"] };
}

function spawnInWorkspace(workspaceDir: string, bin: string, args: string[]) {
  return spawn(bin, args, {
    cwd: workspaceDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", CI: "1" },
    shell: false,
  });
}

export interface TypecheckError {
  file: string;
  line: number;
  message: string;
}

const TS_ERROR_RE = /^(.+?)\((\d+),\d+\):\s*error\s+TS\d+:\s*(.+)$/;

export function parseTypecheckErrors(lines: string[]): TypecheckError[] {
  const errors: TypecheckError[] = [];
  for (const line of lines) {
    const m = line.match(TS_ERROR_RE);
    if (m) {
      errors.push({ file: m[1], line: Number(m[2]), message: m[3] });
    }
  }
  return errors;
}

export interface VerifyRunResult {
  ok: boolean;
  exitCode: number;
  durationMs: number;
  lines: string[];
  errors: TypecheckError[];
  timedOut: boolean;
}

export async function runVerifyInWorkspace(
  workspaceDir: string,
  kind: VerifyKind,
  abortSignal?: AbortSignal,
): Promise<VerifyRunResult> {
  const { bin, args } = await resolveVerifyCommand(workspaceDir, kind);
  const startedAt = Date.now();
  const lines: string[] = [];
  let timedOut = false;

  return new Promise((resolve) => {
    const child = spawnInWorkspace(workspaceDir, bin, args);
    let outBuf = "";
    let errBuf = "";

    const onAbort = () => {
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
    };
    abortSignal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
    }, MAX_DURATION_MS);

    function drainBuf(buf: string, incoming: string): string {
      const full = buf + incoming;
      const parts = full.split("\n");
      for (const part of parts.slice(0, -1)) {
        const text = stripAnsi(part).trimEnd();
        if (text) lines.push(text);
      }
      return parts[parts.length - 1];
    }

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { outBuf = drainBuf(outBuf, chunk); });
    child.stderr.on("data", (chunk: string) => { errBuf = drainBuf(errBuf, chunk); });

    const finish = (code: number | null) => {
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", onAbort);
      for (const buf of [outBuf, errBuf]) {
        const text = stripAnsi(buf).trimEnd();
        if (text) lines.push(text);
      }
      const exitCode = timedOut ? 1 : (code ?? 1);
      const errors = kind === "typecheck" ? parseTypecheckErrors(lines) : [];
      resolve({
        ok: exitCode === 0 && !timedOut,
        exitCode,
        durationMs: Date.now() - startedAt,
        lines,
        errors,
        timedOut,
      });
    };

    child.on("close", finish);
    child.on("error", () => finish(1));
  });
}
