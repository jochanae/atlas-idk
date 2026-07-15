/**
 * browserRunner.ts — Atlas browser flow execution engine
 *
 * Powers the run_browser_flow agent tool. Responsibilities:
 *   1. Mint a scoped browser-test session (READ_ONLY by default)
 *   2. Resolve the browser target from project context (v1: localhost:80)
 *   3. Launch Playwright with system Chromium (no separate download)
 *   4. Enforce same-origin navigation across redirects, clicks, popups
 *   5. Block mutations in READ_ONLY scope via page.route()
 *   6. Execute structured steps with semantic locators
 *   7. Evaluate assertions
 *   8. Capture screenshots + store in GCS under browser-runs/ prefix
 *   9. Persist an execution_run_steps record with step_purpose=BROWSER_FLOW
 *
 * Security invariants:
 *   - startPath must be relative — no cross-origin target
 *   - runId is bound from AgentToolContext, never from model input
 *   - Browser session is separate from the user's live session
 *   - READ_ONLY blocks POST/PUT/PATCH/DELETE at Playwright route layer
 *   - Cross-origin navigation is aborted mid-flow
 */

import { chromium } from "playwright";
import type { BrowserContext, Page } from "playwright";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { randomUUID, createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { logger } from "./logger";
import type {
  BrowserLocator,
  BrowserStepInput,
  BrowserAssertionInput,
  BrowserProfileResult,
  BrowserArtifactRef,
  BrowserTestScope,
  MutationAllow,
  ViewportProfile,
} from "@workspace/run-contract";

// ---------------------------------------------------------------------------
// Viewport profiles — centrally defined, never model-supplied
// ---------------------------------------------------------------------------

const VIEWPORT_DIMS: Record<string, { width: number; height: number }> = {
  DESKTOP:     { width: 1280, height: 720  },
  MOBILE:      { width: 390,  height: 844  },
  FOLD_CLOSED: { width: 412,  height: 919  },
  FOLD_OPEN:   { width: 884,  height: 1080 },
};

// ---------------------------------------------------------------------------
// Browser target resolution
// ---------------------------------------------------------------------------

interface BrowserTarget {
  baseUrl: string;
  allowedOrigin: string;
  environment: "PREVIEW" | "STAGING";
}

function resolveBrowserTarget(_projectId: number): BrowserTarget {
  return {
    baseUrl: "http://localhost:80",
    allowedOrigin: "localhost",
    environment: "PREVIEW",
  };
}

// ---------------------------------------------------------------------------
// Chromium path discovery
// ---------------------------------------------------------------------------

let _chromiumPath: string | null = null;

function findChromiumPath(): string {
  if (_chromiumPath) return _chromiumPath;
  if (process.env["PLAYWRIGHT_CHROMIUM_PATH"]) {
    _chromiumPath = process.env["PLAYWRIGHT_CHROMIUM_PATH"];
    return _chromiumPath;
  }
  try {
    const which = execSync("which chromium", { stdio: "pipe", timeout: 3000 })
      .toString().trim();
    if (which) { _chromiumPath = which; return which; }
  } catch {}
  // Known Replit/Nix store path
  _chromiumPath = "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";
  return _chromiumPath;
}

// ---------------------------------------------------------------------------
// Browser test sessions — scoped, short-lived, separate from live session
// ---------------------------------------------------------------------------

const SESSIONS_TABLE_ENSURED = { done: false };

async function ensureBrowserTestSessionsTable(): Promise<void> {
  if (SESSIONS_TABLE_ENSURED.done) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS browser_test_sessions (
        token            UUID PRIMARY KEY,
        user_id          INTEGER NOT NULL,
        project_id       INTEGER NOT NULL,
        execution_run_id TEXT    NOT NULL,
        scope            TEXT    NOT NULL DEFAULT 'READ_ONLY',
        allowed_mutations JSONB  NOT NULL DEFAULT '[]'::jsonb,
        expires_at       TIMESTAMPTZ NOT NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    SESSIONS_TABLE_ENSURED.done = true;
  } catch (err) {
    logger.warn({ err }, "browserRunner: browser_test_sessions table ensure failed");
  }
}

async function createBrowserTestSession(opts: {
  userId: number;
  projectId: number;
  executionRunId: string;
  scope: BrowserTestScope;
  allowedMutations: MutationAllow[];
}): Promise<string> {
  await ensureBrowserTestSessionsTable();
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  await db.execute(sql`
    INSERT INTO browser_test_sessions
      (token, user_id, project_id, execution_run_id, scope, allowed_mutations, expires_at)
    VALUES (
      ${token}::uuid,
      ${opts.userId},
      ${opts.projectId},
      ${opts.executionRunId},
      ${opts.scope},
      ${JSON.stringify(opts.allowedMutations)}::jsonb,
      ${expiresAt.toISOString()}::timestamptz
    )
  `);
  return token;
}

// ---------------------------------------------------------------------------
// Object storage — GCS under browser-runs/ prefix
// ---------------------------------------------------------------------------

const gcsStorage = new Storage();
const GCS_BUCKET = process.env["DEFAULT_OBJECT_STORAGE_BUCKET_ID"] ?? "";

async function uploadArtifact(
  objectKey: string,
  content: Buffer,
  contentType: string,
): Promise<{ objectKey: string; sha256: string }> {
  const sha256 = createHash("sha256").update(content).digest("hex");
  if (GCS_BUCKET) {
    try {
      const file = gcsStorage.bucket(GCS_BUCKET).file(objectKey);
      await file.save(content, { contentType, resumable: false });
    } catch (err) {
      logger.warn({ err, objectKey }, "browserRunner: GCS upload failed — evidence metadata preserved");
    }
  }
  return { objectKey, sha256 };
}

// ---------------------------------------------------------------------------
// Semantic locator resolution
// ---------------------------------------------------------------------------

function resolveLocator(page: Page, target: BrowserLocator) {
  switch (target.by) {
    case "testId": return page.getByTestId(target.value);
    case "role":   return target.name
      ? page.getByRole(target.role as Parameters<typeof page.getByRole>[0], { name: target.name })
      : page.getByRole(target.role as Parameters<typeof page.getByRole>[0]);
    case "label":  return page.getByLabel(target.value);
    case "text":   return page.getByText(target.value, { exact: false });
    case "css":
    default:       return page.locator("value" in target ? target.value : "body");
  }
}

// ---------------------------------------------------------------------------
// Destructive target guard (READ_ONLY scope)
// ---------------------------------------------------------------------------

const DESTRUCTIVE_LABELS = [
  "delete", "remove account", "remove member", "publish to production",
  "deploy now", "cancel subscription", "billing",
];

function isDestructiveTarget(target: BrowserLocator): boolean {
  const value = "value" in target ? target.value : ("name" in target ? (target as any).name ?? "" : "");
  return DESTRUCTIVE_LABELS.some(d => String(value).toLowerCase().includes(d));
}

// ---------------------------------------------------------------------------
// Step executor
// ---------------------------------------------------------------------------

interface StepResult {
  action: string;
  ok: boolean;
  error?: string;
}

interface ScreenshotRef {
  label: string;
  objectKey: string;
  sha256: string;
}

async function executeSteps(
  page: Page,
  steps: BrowserStepInput[],
  target: BrowserTarget,
  artifactPrefix: string,
  screenshotCount: { n: number },
  scope: BrowserTestScope,
): Promise<{
  stepResults: StepResult[];
  screenshots: ScreenshotRef[];
  consoleErrors: string[];
  networkErrors: Array<{ url: string; status: number }>;
}> {
  const stepResults: StepResult[] = [];
  const screenshots: ScreenshotRef[] = [];
  const consoleErrors: string[] = [];
  const networkErrors: Array<{ url: string; status: number }> = [];

  page.on("console", msg => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 500));
  });
  page.on("response", resp => {
    const s = resp.status();
    if (s >= 400) networkErrors.push({ url: resp.url(), status: s });
  });

  for (const step of steps) {
    try {
      switch (step.action) {
        case "navigate": {
          if (step.path.includes("://")) throw new Error("navigate path must be relative");
          await page.goto(`${target.baseUrl}${step.path}`, {
            waitUntil: "networkidle",
            timeout: 10000,
          });
          stepResults.push({ action: `navigate ${step.path}`, ok: true });
          break;
        }
        case "click": {
          if (scope === "READ_ONLY" && isDestructiveTarget(step.target)) {
            throw new Error(`click target "${JSON.stringify(step.target)}" is destructive — blocked in READ_ONLY scope`);
          }
          const loc = resolveLocator(page, step.target);
          await loc.click({ timeout: 5000 });
          if (step.waitAfterMs) await page.waitForTimeout(Math.min(step.waitAfterMs, 5000));
          stepResults.push({ action: `click ${JSON.stringify(step.target)}`, ok: true });
          break;
        }
        case "fill": {
          const loc = resolveLocator(page, step.target);
          await loc.fill(step.value, { timeout: 5000 });
          stepResults.push({ action: `fill ${JSON.stringify(step.target)}`, ok: true });
          break;
        }
        case "wait": {
          await page.waitForTimeout(Math.min(step.ms, 5000));
          stepResults.push({ action: `wait ${step.ms}ms`, ok: true });
          break;
        }
        case "wait_for": {
          await page.waitForSelector(step.selector, {
            timeout: Math.min(step.timeoutMs ?? 10000, 15000),
          });
          stepResults.push({ action: `wait_for ${step.selector}`, ok: true });
          break;
        }
        case "refresh": {
          await page.reload({ waitUntil: "networkidle", timeout: 10000 });
          stepResults.push({ action: "refresh", ok: true });
          break;
        }
        case "screenshot": {
          if (screenshotCount.n < 10) {
            const label = step.label ?? `shot-${screenshotCount.n}`;
            const buf = Buffer.from(await page.screenshot({ type: "png" }));
            const key = `${artifactPrefix}/${label}.png`;
            const uploaded = await uploadArtifact(key, buf, "image/png");
            screenshots.push({ label, objectKey: uploaded.objectKey, sha256: uploaded.sha256 });
            screenshotCount.n++;
          }
          stepResults.push({ action: `screenshot ${step.label ?? ""}`, ok: true });
          break;
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      stepResults.push({ action: step.action, ok: false, error });
    }
  }

  return { stepResults, screenshots, consoleErrors, networkErrors };
}

// ---------------------------------------------------------------------------
// Assertion runner
// ---------------------------------------------------------------------------

interface AssertionResult {
  type: string;
  value: string;
  passed: boolean;
  actual?: string;
}

async function runAssertions(
  page: Page,
  assertions: BrowserAssertionInput[],
  consoleErrors: string[],
  networkErrors: Array<{ url: string; status: number }>,
): Promise<{ passed: number; failed: number; results: AssertionResult[] }> {
  let passed = 0;
  let failed = 0;
  const results: AssertionResult[] = [];

  for (const a of assertions) {
    try {
      switch (a.type) {
        case "text_visible": {
          const text = await page.textContent("body") ?? "";
          const ok = text.includes(a.value);
          results.push({ type: a.type, value: a.value, passed: ok, actual: ok ? undefined : "not found in page body" });
          ok ? passed++ : failed++;
          break;
        }
        case "url_contains": {
          const url = page.url();
          const ok = url.includes(a.value);
          results.push({ type: a.type, value: a.value, passed: ok, actual: url });
          ok ? passed++ : failed++;
          break;
        }
        case "element_visible": {
          const ok = await page.locator(a.selector).isVisible({ timeout: 3000 }).catch(() => false);
          results.push({ type: a.type, value: a.selector, passed: ok, actual: ok ? undefined : "not visible" });
          ok ? passed++ : failed++;
          break;
        }
        case "element_absent": {
          const visible = await page.locator(a.selector).isVisible({ timeout: 1000 }).catch(() => false);
          const ok = !visible;
          results.push({ type: a.type, value: a.selector, passed: ok, actual: ok ? undefined : "found (should be absent)" });
          ok ? passed++ : failed++;
          break;
        }
        case "no_console_errors": {
          const ok = consoleErrors.length === 0;
          results.push({ type: a.type, value: "no console errors", passed: ok,
            actual: ok ? undefined : `${consoleErrors.length} error(s): ${consoleErrors.slice(0, 2).join("; ")}` });
          ok ? passed++ : failed++;
          break;
        }
        case "no_network_errors": {
          const relevant = a.pattern
            ? networkErrors.filter(e => e.url.includes(a.pattern!))
            : networkErrors.filter(e => e.status >= 500);
          const ok = relevant.length === 0;
          results.push({ type: a.type, value: a.pattern ?? "5xx errors", passed: ok,
            actual: ok ? undefined : relevant.map(e => `${e.status} ${e.url}`).slice(0, 3).join("; ") });
          ok ? passed++ : failed++;
          break;
        }
      }
    } catch (err) {
      results.push({ type: (a as any).type, value: "", passed: false,
        actual: `assertion error: ${err instanceof Error ? err.message : String(err)}` });
      failed++;
    }
  }

  return { passed, failed, results };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BrowserRunnerOptions {
  userId: number;
  projectId: number;
  executionRunId: string;
  startPath: string;
  viewports: string[];
  steps: BrowserStepInput[];
  assertions: BrowserAssertionInput[];
  scope?: BrowserTestScope;
  allowedMutations?: MutationAllow[];
  timeoutMs?: number;
}

export interface BrowserFlowResult {
  success: boolean;
  finalUrl: string;
  profileResults: BrowserProfileResult[];
  allProfilesPassed: boolean;
  assertionsPassed: number;
  assertionsFailed: number;
  traceId: string;
  durationMs: number;
  stepRecordId: number | null;
  consoleErrors: string[];
  networkErrors: Array<{ url: string; status: number }>;
  artifacts: BrowserArtifactRef[];
}

export async function runBrowserFlow(opts: BrowserRunnerOptions): Promise<BrowserFlowResult> {
  const startedAt = Date.now();
  const traceId = randomUUID();
  const scope = opts.scope ?? "READ_ONLY";
  const allowedMutations = opts.allowedMutations ?? [];
  const viewports = opts.viewports.length > 0 ? opts.viewports : ["DESKTOP"];
  const target = resolveBrowserTarget(opts.projectId);
  const stepId = randomUUID();
  const artifactPrefix = `browser-runs/${opts.userId}/${opts.projectId}/${opts.executionRunId}/${stepId}`;

  // ── Security: validate startPath ────────────────────────────────────────
  if (opts.startPath.includes("://")) {
    throw new Error("startPath must be a relative path (e.g. '/workspace/123'), not an absolute URL. The server resolves the base URL.");
  }

  // ── Health probe ─────────────────────────────────────────────────────────
  try {
    const probe = await fetch(`${target.baseUrl}/`);
    if (!probe.ok && probe.status >= 500) {
      throw new Error(`App health probe returned ${probe.status} — browser flow aborted`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("health probe")) throw err;
    throw new Error(`App not reachable at ${target.baseUrl}: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Mint browser test session ─────────────────────────────────────────────
  const sessionToken = await createBrowserTestSession({
    userId: opts.userId,
    projectId: opts.projectId,
    executionRunId: opts.executionRunId,
    scope,
    allowedMutations,
  });

  const chromiumPath = findChromiumPath();
  const profileResults: BrowserProfileResult[] = [];
  const allArtifacts: BrowserArtifactRef[] = [];
  const screenshotCount = { n: 0 };
  let allConsolErrors: string[] = [];
  let allNetworkErrors: Array<{ url: string; status: number }> = [];
  let lastFinalUrl = "";
  let allProfilesPassed = true;

  for (const viewport of viewports) {
    const vpDims = VIEWPORT_DIMS[viewport] ?? VIEWPORT_DIMS["DESKTOP"]!;

    const browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
             "--disable-web-security", "--disable-features=IsolateOrigins,site-per-process"],
    });

    const context: BrowserContext = await browser.newContext({
      viewport: vpDims,
      userAgent: `Atlas-BrowserRunner/1.0 (${viewport}; verification-flow)`,
      ignoreHTTPSErrors: true,
    });

    // ── Same-origin enforcement + scope guard ───────────────────────────────
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      // Block cross-origin: only localhost allowed
      if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1" && url.hostname !== target.allowedOrigin) {
        await route.abort("blockedbyclient");
        return;
      }
      // READ_ONLY: block mutations unless explicitly allowed
      if (scope === "READ_ONLY") {
        const method = route.request().method().toUpperCase();
        if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
          const reqUrl = route.request().url();
          const permitted = allowedMutations.some(
            m => m.method === method && reqUrl.includes(m.pathPattern),
          );
          if (!permitted) { await route.abort("blockedbyclient"); return; }
        }
      }
      // Inject browser-test token for server-side audit trail
      await route.continue({
        headers: { ...route.request().headers(), "x-browser-test-token": sessionToken },
      });
    });

    // Block dangerous schemes
    await context.route(/^(file:|data:|blob:|javascript:)/, route => route.abort("blockedbyclient"));

    // Block new tabs / popups
    context.on("page", p => { void p.close(); });

    const page = await context.newPage();

    // ── Authenticate via browser-test-session endpoint ──────────────────────
    try {
      await page.goto(
        `${target.baseUrl}/api/auth/browser-test-session?token=${sessionToken}`,
        { waitUntil: "networkidle", timeout: 8000 },
      );
    } catch (authErr) {
      logger.warn({ authErr }, "browserRunner: auth session navigate failed — continuing unauthenticated");
    }

    // ── Execute steps ────────────────────────────────────────────────────────
    const { stepResults, screenshots, consoleErrors, networkErrors } = await executeSteps(
      page, opts.steps, target, `${artifactPrefix}/${viewport}`, screenshotCount, scope,
    );

    // ── Capture final screenshot ─────────────────────────────────────────────
    if (screenshotCount.n < 10) {
      try {
        const buf = Buffer.from(await page.screenshot({ type: "png" }));
        const key = `${artifactPrefix}/${viewport}/final.png`;
        const up = await uploadArtifact(key, buf, "image/png");
        screenshots.push({ label: `${viewport}-final`, objectKey: up.objectKey, sha256: up.sha256 });
        allArtifacts.push({ type: "SCREENSHOT", objectKey: up.objectKey, sha256: up.sha256, createdAt: new Date().toISOString() });
        screenshotCount.n++;
      } catch {}
    }

    // ── Run assertions ────────────────────────────────────────────────────────
    const { passed, failed, results: assertionResults } = await runAssertions(
      page, opts.assertions, consoleErrors, networkErrors,
    );

    lastFinalUrl = page.url();
    const profileSuccess = failed === 0 && stepResults.every(r => r.ok);

    profileResults.push({
      viewport,
      success: profileSuccess,
      assertionsPassed: passed,
      assertionsFailed: failed,
      finalUrl: lastFinalUrl,
    });

    if (!profileSuccess) allProfilesPassed = false;
    allConsolErrors = allConsolErrors.concat(consoleErrors);
    allNetworkErrors = allNetworkErrors.concat(networkErrors);

    await context.close();
    await browser.close();
  }

  const totalPassed = profileResults.reduce((s, r) => s + r.assertionsPassed, 0);
  const totalFailed = profileResults.reduce((s, r) => s + r.assertionsFailed, 0);
  const durationMs = Date.now() - startedAt;

  // ── Persist report to GCS ─────────────────────────────────────────────────
  const report = {
    traceId,
    executionRunId: opts.executionRunId,
    viewports,
    profileResults,
    assertionsPassed: totalPassed,
    assertionsFailed: totalFailed,
    durationMs,
    createdAt: new Date().toISOString(),
  };
  const reportKey = `${artifactPrefix}/report.json`;
  try {
    const reportBuf = Buffer.from(JSON.stringify(report, null, 2), "utf8");
    const up = await uploadArtifact(reportKey, reportBuf, "application/json");
    allArtifacts.push({ type: "REPORT", objectKey: up.objectKey, sha256: up.sha256, createdAt: new Date().toISOString() });
  } catch {}

  // ── Persist execution_run_step with step_purpose=BROWSER_FLOW ─────────────
  let stepRecordId: number | null = null;
  try {
    const countRow = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM execution_run_steps WHERE run_id = ${opts.executionRunId}
    `);
    const stepIndex = Number((countRow.rows[0] as any)?.cnt ?? 0);

    const metadata = {
      traceId,
      viewports,
      profileResults,
      assertionsPassed: totalPassed,
      assertionsFailed: totalFailed,
      completedProfiles: profileResults.filter(r => r.success).map(r => r.viewport),
      failedProfiles: profileResults.filter(r => !r.success).map(r => r.viewport),
      artifacts: allArtifacts,
      reportObjectKey: reportKey,
      durationMs,
    };

    const ins = await db.execute(sql`
      INSERT INTO execution_run_steps
        (run_id, order_index, verb, target, phase, step_purpose, status, evidence_ref, metadata)
      VALUES (
        ${opts.executionRunId},
        ${stepIndex},
        'BROWSER_TEST',
        ${opts.startPath},
        'verify',
        'BROWSER_FLOW',
        ${allProfilesPassed ? "ok" : "fail"},
        ${traceId},
        ${JSON.stringify(metadata)}::jsonb
      )
      RETURNING id
    `);
    stepRecordId = Number((ins.rows[0] as any)?.id ?? null) || null;
  } catch (err) {
    logger.warn({ err }, "browserRunner: failed to persist execution_run_step — non-fatal");
  }

  return {
    success: allProfilesPassed,
    finalUrl: lastFinalUrl,
    profileResults,
    allProfilesPassed,
    assertionsPassed: totalPassed,
    assertionsFailed: totalFailed,
    traceId,
    durationMs,
    stepRecordId,
    consoleErrors: allConsolErrors,
    networkErrors: allNetworkErrors,
    artifacts: allArtifacts,
  };
}
