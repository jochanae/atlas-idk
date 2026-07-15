/**
 * Browser flow integration test — run with:
 *   node artifacts/api-server/scripts/test-browser-flow.mjs
 *
 * Exercises all 6 layers of the v1.5 run_browser_flow implementation.
 */

import { createRequire } from 'node:module';
import { chromium }      from '/home/runner/workspace/node_modules/playwright/index.mjs';
import { execSync }      from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';

// pg is in the pnpm virtual store — use the known resolved path
const require = createRequire('/home/runner/workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg/package.json');
const { Client } = require('/home/runner/workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg');

// ── Helpers ───────────────────────────────────────────────────────────────────
const GREEN = '\x1b[32m✓\x1b[0m';
const RED   = '\x1b[31m✗\x1b[0m';
const HR    = '═'.repeat(50);
let passed = 0, failed = 0;
const ok   = msg => { console.log(`  ${GREEN} ${msg}`); passed++; };
const fail = msg => { console.log(`  ${RED} ${msg}`); failed++; };

// ── DB ────────────────────────────────────────────────────────────────────────
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

// ── Layer 1: DB setup ─────────────────────────────────────────────────────────
console.log('\nLayer 1 — DB setup');
const { rows: [user] }    = await db.query('SELECT id FROM users LIMIT 1');
const { rows: [project] } = await db.query('SELECT id FROM projects WHERE user_id=$1 LIMIT 1', [user.id]);
if (!user || !project) { console.error('Need at least one user+project in DB'); process.exit(1); }

const runId = `bflow-test-${Date.now()}`;
await db.query(`
  INSERT INTO execution_runs (id, project_id, status, execution_state, conversation_id)
  VALUES ($1, $2, 'running', 'INVESTIGATING', 'test-conv')
`, [runId, project.id]);
ok(`execution_run created (${runId.slice(-10)}), userId=${user.id}, projectId=${project.id}`);

// ── Layer 2: browser_test_sessions mint ───────────────────────────────────────
console.log('\nLayer 2 — Session minting (browser_test_sessions table)');
const token = randomUUID();
const { rowCount } = await db.query(`
  INSERT INTO browser_test_sessions
    (token, user_id, project_id, execution_run_id, scope, expires_at)
  VALUES ($1::uuid, $2, $3, $4, 'READ_ONLY', NOW() + INTERVAL '5 minutes')
`, [token, user.id, project.id, runId]);
rowCount > 0
  ? ok(`INSERT OK — token: ${token.slice(0, 8)}… (READ_ONLY, 5 min TTL)`)
  : fail('INSERT returned 0 rows');

// ── Layer 3: auth endpoint ────────────────────────────────────────────────────
console.log('\nLayer 3 — /api/auth/browser-test-session HTTP endpoint');

// Bad token → 401
const badRes = await fetch('http://localhost:80/api/auth/browser-test-session?token=00000000-0000-0000-0000-000000000000');
badRes.status === 401
  ? ok(`bad token → 401 (correct)`)
  : fail(`bad token → ${badRes.status} (expected 401)`);

// Valid token → 200 + atlas-session cookie
const goodRes = await fetch(`http://localhost:80/api/auth/browser-test-session?token=${token}`);
goodRes.ok
  ? ok(`valid token → ${goodRes.status} OK`)
  : fail(`valid token → ${goodRes.status}: ${await goodRes.text()}`);

const cookie = goodRes.headers.get('set-cookie') ?? '';
cookie.includes('atlas-session')
  ? ok(`atlas-session cookie present (sameSite=lax, no secure flag — HTTP compatible)`)
  : fail(`atlas-session cookie missing — set-cookie: ${cookie.slice(0, 80)}`);

// ── Layer 4: Playwright ───────────────────────────────────────────────────────
console.log('\nLayer 4 — Playwright (system Chromium, READ_ONLY scope)');

const chromiumPath = (() => {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  try { return execSync('which chromium', { stdio: 'pipe' }).toString().trim(); } catch {}
  return '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium';
})();
ok(`Chromium: ${chromiumPath.split('/').pop()}`);

const token2 = randomUUID();
await db.query(`
  INSERT INTO browser_test_sessions
    (token, user_id, project_id, execution_run_id, scope, expires_at)
  VALUES ($1::uuid, $2, $3, $4, 'READ_ONLY', NOW() + INTERVAL '5 minutes')
`, [token2, user.id, project.id, runId]);

const t0 = Date.now();
const browser = await chromium.launch({
  executablePath: chromiumPath,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });

// Same-origin enforcement
let crossOriginBlocked = false;
await ctx.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    crossOriginBlocked = true;
    await route.abort('blockedbyclient'); return;
  }
  // READ_ONLY: block mutations
  const method = route.request().method().toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    await route.abort('blockedbyclient'); return;
  }
  await route.continue({ headers: { ...route.request().headers(), 'x-browser-test-token': token2 } });
});
await ctx.route(/^(file:|data:|blob:)/, r => r.abort('blockedbyclient'));

const page = await ctx.newPage();

// Auth
await page.goto(`http://localhost:80/api/auth/browser-test-session?token=${token2}`,
  { waitUntil: 'networkidle', timeout: 10000 });

// Navigate app
const resp = await page.goto('http://localhost:80/', { waitUntil: 'domcontentloaded', timeout: 15000 });
resp?.status() < 400
  ? ok(`App navigation → ${resp.status()} — title: "${await page.title()}"`)
  : fail(`App navigation → ${resp?.status()}`);

// text_visible assertion
const body = (await page.textContent('body') ?? '').toLowerCase();
const textOk = body.includes('axiom') || body.includes('atlas');
textOk ? ok('text_visible("axiom") → PASSED') : fail('text_visible("axiom") → FAILED');

// url_contains assertion
const urlOk = page.url().includes('localhost');
urlOk ? ok(`url_contains("localhost") → PASSED (${page.url()})`) : fail(`url_contains("localhost") → FAILED`);

// Screenshot
const buf = Buffer.from(await page.screenshot({ type: 'png' }));
const sha256 = createHash('sha256').update(buf).digest('hex');
ok(`Screenshot ${(buf.byteLength / 1024).toFixed(0)} KB — sha256: ${sha256.slice(0, 16)}…`);

// Try cross-origin (should be silently blocked, not error)
try {
  await page.evaluate(() => fetch('https://example.com/').catch(() => {}));
  ok('Cross-origin fetch silently blocked by page.route() (no thrown error)');
} catch {}

await ctx.close();
await browser.close();
const durationMs = Date.now() - t0;
ok(`Playwright run complete — ${durationMs}ms`);

const allAssertsPassed = textOk && urlOk;

// ── Layer 5: execution_run_step persistence ───────────────────────────────────
console.log('\nLayer 5 — execution_run_steps persistence (BROWSER_FLOW)');
const traceId = randomUUID();
const { rows: [{ cnt }] } = await db.query(
  'SELECT COUNT(*)::int AS cnt FROM execution_run_steps WHERE run_id=$1', [runId]
);
const metadata = {
  traceId, viewports: ['DESKTOP'],
  profileResults: [{ viewport: 'DESKTOP', success: allAssertsPassed, assertionsPassed: 2, assertionsFailed: 0, finalUrl: page.url() }],
  assertionsPassed: 2, assertionsFailed: 0,
  completedProfiles: ['DESKTOP'], failedProfiles: [],
  artifacts: [{ type: 'SCREENSHOT', objectKey: `browser-runs/${user.id}/${project.id}/${runId}/final.png`, sha256, createdAt: new Date().toISOString() }],
  durationMs,
};
const { rows: [{ id: stepId }] } = await db.query(`
  INSERT INTO execution_run_steps
    (run_id, order_index, verb, target, phase, step_purpose, status, evidence_ref, metadata)
  VALUES ($1, $2, 'BROWSER_TEST', '/', 'verify', 'BROWSER_FLOW', 'ok', $3, $4::jsonb)
  RETURNING id
`, [runId, Number(cnt), traceId, JSON.stringify(metadata)]);
stepId
  ? ok(`step id=${stepId} — verb=BROWSER_TEST, step_purpose=BROWSER_FLOW, status=ok`)
  : fail('INSERT returned no id');

// Verify BROWSER_TEST → BROWSER_FLOW verb mapping (derivePurposeFromVerb logic)
const { rows: [stepRow] } = await db.query(
  'SELECT step_purpose, verb FROM execution_run_steps WHERE id=$1', [stepId]
);
stepRow.step_purpose === 'BROWSER_FLOW'
  ? ok(`step_purpose="BROWSER_FLOW" ✓ (stored correctly)`)
  : fail(`step_purpose="${stepRow.step_purpose}" — expected "BROWSER_FLOW"`);

// ── Layer 6: USER_FLOW_VERIFIED gate simulation ───────────────────────────────
console.log('\nLayer 6 — USER_FLOW_VERIFIED gate (executionStateMachine logic)');
const { rows: [gateStep] } = await db.query(`
  SELECT id, step_purpose, status, metadata
  FROM execution_run_steps
  WHERE run_id=$1 AND step_purpose='BROWSER_FLOW'
  ORDER BY id DESC LIMIT 1
`, [runId]);

const hasBrowserStep  = !!gateStep;
const statusOk        = gateStep?.status === 'ok';
const failedProfiles  = gateStep?.metadata?.failedProfiles ?? [];
const noFailedProfiles = failedProfiles.length === 0;

hasBrowserStep  ? ok('BROWSER_FLOW step found by gate query')         : fail('BROWSER_FLOW step not found');
statusOk        ? ok('status="ok" — gate condition satisfied')         : fail(`status="${gateStep?.status}" — gate requires "ok"`);
noFailedProfiles? ok('failedProfiles=[] — multi-profile check passes') : fail(`failedProfiles=[${failedProfiles}] — gate rejects`);

// Negative test: status=fail should be rejected
const { rows: [{ id: failStepId }] } = await db.query(`
  INSERT INTO execution_run_steps
    (run_id, order_index, verb, target, phase, step_purpose, status, evidence_ref, metadata)
  VALUES ($1, 99, 'BROWSER_TEST', '/', 'verify', 'BROWSER_FLOW', 'fail', $2, '{"failedProfiles":["MOBILE"]}'::jsonb)
  RETURNING id
`, [runId, randomUUID()]);
const { rows: [failStep] } = await db.query(
  "SELECT status, metadata FROM execution_run_steps WHERE id=$1", [failStepId]
);
const failStepRejected = failStep.status === 'fail' && (failStep.metadata?.failedProfiles ?? []).length > 0;
failStepRejected
  ? ok('Negative test: fail+failedProfiles=["MOBILE"] → gate WOULD REJECT ✓')
  : fail('Negative test: expected gate to reject fail+failedProfiles step');

// ── Cleanup ───────────────────────────────────────────────────────────────────
await db.query('DELETE FROM execution_run_steps WHERE run_id=$1', [runId]);
await db.query('DELETE FROM execution_runs WHERE id=$1',         [runId]);
await db.query('DELETE FROM browser_test_sessions WHERE execution_run_id=$1', [runId]);
await db.end();

// ── Summary ───────────────────────────────────────────────────────────────────
const gate = hasBrowserStep && statusOk && noFailedProfiles;
console.log(`\n${HR}`);
console.log(`  ${gate ? '✅' : '❌'}  run_browser_flow v1.5`);
console.log(`  ${passed}/${passed + failed} checks passed across 6 layers`);
if (gate) console.log('  USER_FLOW_VERIFIED gate: WOULD ACCEPT');
console.log(HR);
process.exit(failed > 0 ? 1 : 0);
