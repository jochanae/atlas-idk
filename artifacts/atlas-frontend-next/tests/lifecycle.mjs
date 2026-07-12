/**
 * Run Lifecycle Contract v1.2 — interactive regression test
 *
 * Uses system Chromium (resolved at runtime). Runs against the local dev
 * server via the shared proxy — no external URL, no hardcoded domain.
 *
 * Usage:
 *   pnpm --filter @workspace/atlas-frontend-next run test
 *   node artifacts/atlas-frontend-next/tests/lifecycle.mjs
 *
 * Requires the atlas-frontend-next workflow to be running (port 20250).
 * The shared proxy at localhost:80 routes /atlas-next/ to it automatically.
 *
 * Add to CI: run after `pnpm --filter @workspace/atlas-frontend-next run dev &`
 */

import { chromium } from "playwright";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";

// ── Resolve Chromium ──────────────────────────────────────────────────────────
function findChromium() {
  for (const cmd of ["chromium", "chromium-browser", "google-chrome"]) {
    try { return execSync(`which ${cmd}`, { encoding: "utf8" }).trim(); } catch {}
  }
  // Nix store fallback
  try {
    const hit = execSync("find /nix/store -maxdepth 3 -name chromium -type f 2>/dev/null | head -1", { encoding: "utf8" }).trim();
    if (hit) return hit;
  } catch {}
  throw new Error("Chromium not found. Install chromium or set CHROMIUM_PATH.");
}

const CHROMIUM = process.env.CHROMIUM_PATH ?? findChromium();
const BASE = process.env.LIFECYCLE_TEST_URL ?? "http://localhost:80/atlas-next/";
const SS_DIR = process.env.LIFECYCLE_SS_DIR ?? "/tmp/atlas-lifecycle-screenshots";

mkdirSync(SS_DIR, { recursive: true });

// ── Test harness ──────────────────────────────────────────────────────────────
let passCount = 0;
let failCount = 0;
const log = (m) => console.log(m);
const results = [];

function pass(label) {
  passCount++;
  results.push({ label, ok: true });
  log(`  ✓ ${label}`);
}
function fail(label, detail = "") {
  failCount++;
  results.push({ label, ok: false, detail });
  log(`  ✗ ${label}${detail ? ": " + detail : ""}`);
}
async function ss(page, name) {
  const p = `${SS_DIR}/${name}.png`;
  await page.screenshot({ path: p });
  log(`  📸 ${p}`);
  return p;
}

async function assertVisible(page, text, label) {
  const n = await page.getByText(text, { exact: false }).count();
  n > 0 ? pass(label) : (fail(label, `"${text}" not found`), await ss(page, `FAIL_${label.replace(/\W+/g, "_").slice(0, 40)}`));
}
async function assertNotVisible(page, text, label) {
  const n = await page.getByText(text, { exact: false }).count();
  n === 0 ? pass(label) : (fail(label, `"${text}" unexpectedly found`), await ss(page, `FAIL_${label.replace(/\W+/g, "_").slice(0, 40)}`));
}
async function assertBtnAbsent(page, name, label) {
  const n = await page.getByRole("button", { name, exact: true }).count();
  n === 0 ? pass(label) : (fail(label, `button "${name}" still present`), await ss(page, `FAIL_${label.replace(/\W+/g, "_").slice(0, 40)}`));
}
async function waitForText(page, text, label, timeout = 5000) {
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
    pass(label);
  } catch {
    fail(label, `"${text}" never appeared within ${timeout}ms`);
    await ss(page, `FAIL_${label.replace(/\W+/g, "_").slice(0, 40)}`);
  }
}

async function freshPage(ctx) {
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: "networkidle", timeout: 15000 });
  await p.waitForTimeout(700);
  return p;
}
async function story(page, label) {
  await page.getByRole("button", { name: label, exact: true }).click();
  log(`  → ${label}`);
}

// ── Run ───────────────────────────────────────────────────────────────────────
log(`\nAtlas Next — Run Lifecycle Contract v1.2\n  URL: ${BASE}\n  Chromium: ${CHROMIUM}\n`);

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// ─────────────────────────────────────────────────────────────────────────────
log("══ T1: Zero state ══");
{
  const page = await freshPage(ctx);
  await assertVisible(page, "No runs yet", "zero state: 'No runs yet' visible");
  await assertVisible(page, "Atlas · Next", "header branding");
  await assertVisible(page, "connected", "connection dot: connected");
  for (const t of ["Chat", "Timeline", "Changes", "Terminal", "Outputs"])
    await assertVisible(page, t, `tab '${t}' present`);
  const dis = await page.getByRole("button", { name: "Full success path", exact: true }).isDisabled();
  dis ? fail("BUILD buttons enabled at zero state") : pass("BUILD buttons enabled at zero state");
  await assertNotVisible(page, "Apply changes", "no Apply button at zero state");
  await ss(page, "T1_zero_state");
  await page.close();
}

// ─────────────────────────────────────────────────────────────────────────────
log("\n══ T2: BUILD full success — all 8 states (event-driven) ══");
{
  const page = await freshPage(ctx);
  await story(page, "Full success path");

  // All checks use waitFor — no fixed-offset timing fragility
  await waitForText(page, "Thinking",              "thinking badge");
  await waitForText(page, "Atlas is thinking",     "ThinkingIndicator text");
  await assertNotVisible(page, "Apply changes",    "no Apply during thinking");

  await waitForText(page, "Planning",              "planning badge");

  // plan_ready: PlanCard appears
  await waitForText(page, "Add YouTube as a recognized traffic source", "PlanCard title (plan_ready)");
  await waitForText(page, "trafficMap.ts",         "plan item file");

  await waitForText(page, "Awaiting confirmation", "awaiting_confirmation badge");
  await assertVisible(page, "Apply changes",       "Apply button present");
  await assertVisible(page, "Cancel",              "Cancel button present");

  // One-card rule: exactly 1 Apply button
  const applyCount = await page.getByRole("button", { name: "Apply changes", exact: true }).count();
  applyCount === 1 ? pass("exactly one Apply button (One Live Card Rule)") : fail("One Live Card Rule", `${applyCount} Apply buttons`);

  await ss(page, "T2_awaiting_confirmation");

  // Auto-confirm fires at 2600ms from click
  await waitForText(page, "Executing",             "executing badge (auto-confirm)");
  await assertBtnAbsent(page, "Apply changes",     "Apply gone after auto-confirm");
  await assertVisible(page, "Step",                "step counter during executing");

  await ss(page, "T2_executing");

  await waitForText(page, "Testing",               "testing badge");
  await ss(page, "T2_testing");

  await waitForText(page, "Verifying",             "verifying badge");
  await ss(page, "T2_verifying");

  await waitForText(page, "Succeeded",             "succeeded receipt badge", 4000);
  await assertVisible(page, "Added YouTube as recognized traffic source", "receipt summary");
  await assertVisible(page, "Commit to GitHub",    "Commit button on succeeded BUILD");
  await assertBtnAbsent(page, "Apply changes",     "Apply gone after terminal (One Card Rule)");

  const buildBtn = page.getByRole("button", { name: "Full success path", exact: true });
  (await buildBtn.isDisabled()) ? fail("BUILD buttons re-enabled after succeeded") : pass("BUILD buttons re-enabled after succeeded");

  await ss(page, "T2_succeeded_receipt");

  // Commit flow
  await page.getByRole("button", { name: "Commit to GitHub", exact: true }).click();
  await waitForText(page, "a1b2c3", "commit SHA link after commit", 3000);
  await assertBtnAbsent(page, "Commit to GitHub", "Commit button gone after commit");
  await ss(page, "T2_committed");

  await page.close();
}

// ─────────────────────────────────────────────────────────────────────────────
log("\n══ T3: Gate 1 — Apply changes ══");
{
  const page = await freshPage(ctx);
  await story(page, "Stop at confirmation (Gate 1)");

  await waitForText(page, "Awaiting confirmation", "at gate");

  const c1 = await page.getByRole("button", { name: "Apply changes", exact: true }).count();
  c1 === 1 ? pass("exactly 1 Apply button") : fail("Apply button count", String(c1));

  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  await page.waitForTimeout(400);

  await assertVisible(page, "Executing",           "status → executing after Apply");
  await assertBtnAbsent(page, "Apply changes",     "Apply button gone after confirm");
  await assertBtnAbsent(page, "Cancel",            "Cancel button (role=button) gone after confirm");
  // "Cancel" word may still appear in "Cancel it or wait" warning — that is expected
  await assertVisible(page, "Add YouTube as a recognized traffic source", "PlanCard still rendered while executing");

  const locked = await page.getByRole("button", { name: "Full success path", exact: true }).isDisabled();
  locked ? pass("BUILD locked while executing") : fail("BUILD locked while executing");

  await ss(page, "T3_gate1_applied");
  await page.close();
}

// ─────────────────────────────────────────────────────────────────────────────
log("\n══ T4: Gate 1 — Cancel (no partial-write warning) ══");
{
  const page = await freshPage(ctx);
  await story(page, "Stop at confirmation (Gate 1)");
  await waitForText(page, "Awaiting confirmation", "at gate");

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForTimeout(400);

  await assertVisible(page, "Cancelled",           "cancelled receipt badge");
  await assertNotVisible(page, "Some files may have been partially updated", "NO partial-write warning (error=null at gate)");
  await assertBtnAbsent(page, "Apply changes",     "no Apply after cancel");
  const unlocked = await page.getByRole("button", { name: "Full success path", exact: true }).isDisabled();
  unlocked ? fail("BUILD re-enabled after cancel") : pass("BUILD re-enabled after cancel");

  await ss(page, "T4_cancelled_no_partial_warning");
  await page.close();
}

// ─────────────────────────────────────────────────────────────────────────────
log("\n══ T5: Fail mid-execution — TOOL_FAILURE + partial-write warning ══");
{
  const page = await freshPage(ctx);
  await story(page, "Fail mid-execution (partial writes)");

  // auto-confirms at 2600ms, run_complete(failed) at 4600ms
  await waitForText(page, "Failed",                "failed badge", 8000);
  await assertVisible(page, "TOOL_FAILURE",        "error code visible");
  await assertVisible(page, "TypeScript check failed on src/lib/trafficMap.ts (line 42).", "error message visible");
  await assertVisible(page, "Some files may have been partially updated. Review the Changes tab.", "partial-write warning visible");
  await assertBtnAbsent(page, "Apply changes",     "no Apply on terminal state");
  const unlocked = await page.getByRole("button", { name: "Full success path", exact: true }).isDisabled();
  unlocked ? fail("BUILD re-enabled after fail") : pass("BUILD re-enabled after fail");

  await ss(page, "T5_failed_partial_write");
  await page.close();
}

// ─────────────────────────────────────────────────────────────────────────────
log("\n══ T6: Concurrent BUILD + CHAT ══");
{
  const page = await freshPage(ctx);
  await story(page, "Stop at confirmation (Gate 1)");
  await waitForText(page, "Awaiting confirmation", "BUILD at gate");

  // CHAT is not blocked by BUILD
  const chatBtn = page.getByRole("button", { name: "Send chat turn", exact: true });
  (await chatBtn.isDisabled()) ? fail("Send chat turn enabled during BUILD") : pass("Send chat turn enabled during BUILD");

  await story(page, "Send chat turn");
  await page.waitForTimeout(400);

  await assertVisible(page, "Awaiting confirmation", "BUILD PlanCard unchanged");
  await assertVisible(page, "Apply changes",          "Apply still present (BUILD)");
  await assertVisible(page, "Thinking",               "CHAT ThinkingIndicator badge");
  await assertVisible(page, "Atlas is thinking",      "CHAT ThinkingIndicator text");

  const applyCount = await page.getByRole("button", { name: "Apply changes", exact: true }).count();
  applyCount === 1 ? pass("exactly 1 Apply button (no card duplication)") : fail("One Live Card Rule during concurrent run", `${applyCount}`);

  await ss(page, "T6_concurrent_build_chat");

  // CHAT completes at ~1200ms from click — wait for the button to become enabled
  // (activeTurn becomes null once run is terminal, which re-enables the button)
  await assertVisible(page, "Apply changes", "BUILD Apply still present while CHAT resolves");
  try {
    await page.waitForFunction(
      () => {
        const btns = [...document.querySelectorAll("button")];
        const b = btns.find((el) => el.textContent?.trim() === "Send chat turn");
        return b != null && !b.disabled;
      },
      { timeout: 3000 },
    );
    pass("CHAT button re-enabled after turn (activeTurn=null)");
  } catch {
    fail("CHAT button re-enabled after turn (activeTurn=null)");
    await ss(page, "FAIL_T6_chat_btn_not_reenabled");
  }

  await ss(page, "T6_after_chat_complete");
  await page.close();
}

// ─────────────────────────────────────────────────────────────────────────────
log("\n══ T7: Tab consistency — all tabs read from RunProvider ══");
{
  const page = await freshPage(ctx);
  await story(page, "Stop at confirmation (Gate 1)");
  await waitForText(page, "Awaiting confirmation", "BUILD active");

  await page.getByRole("button", { name: "Timeline" }).click();
  await assertVisible(page, "BUILD",                      "Timeline: BUILD intent label");
  await assertVisible(page, "Add YouTube as a recognized traffic source", "Timeline: plan title");
  await assertVisible(page, "Awaiting confirmation",      "Timeline: current status badge");
  await assertNotVisible(page, "No runs yet.",            "Timeline: not empty");
  await ss(page, "T7_timeline");

  await page.getByRole("button", { name: "Changes" }).click();
  await assertVisible(page, "src/lib/trafficMap.ts",      "Changes: file 1");
  await assertVisible(page, "src/components/TrafficChannels.tsx", "Changes: file 2");
  await assertVisible(page, "src/lib/trafficMap.test.ts", "Changes: file 3");
  await assertNotVisible(page, "No BUILD run to show changes for.", "Changes: not empty");
  await ss(page, "T7_changes");

  await page.getByRole("button", { name: "Terminal" }).click();
  await assertVisible(page, "atlas run",                  "Terminal: run command");
  await assertVisible(page, "Add YouTube",                "Terminal: plan title");
  await assertNotVisible(page, "No active build",         "Terminal: not empty");
  await ss(page, "T7_terminal");

  await page.getByRole("button", { name: "Outputs" }).click();
  await assertVisible(page, "No completed runs yet.",     "Outputs: empty (no succeeded runs)");
  await ss(page, "T7_outputs_empty");

  await page.close();
}

// ─────────────────────────────────────────────────────────────────────────────
log("\n══ T8: Refresh resets mocked state (Phase 1 expected behavior) ══");
{
  const page = await freshPage(ctx);
  await story(page, "Stop at confirmation (Gate 1)");
  await waitForText(page, "Awaiting confirmation", "state live before refresh");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  await assertVisible(page, "No runs yet",              "refresh clears in-memory state (expected Phase 1)");
  await assertNotVisible(page, "Awaiting confirmation", "no stale state after refresh");
  const unlocked = await page.getByRole("button", { name: "Full success path", exact: true }).isDisabled();
  unlocked ? fail("BUILD buttons enabled after refresh") : pass("BUILD buttons enabled after refresh");

  await ss(page, "T8_after_refresh");
  await page.close();
}

// ─────────────────────────────────────────────────────────────────────────────
log("\n══ T9: Outputs populates after succeeded run ══");
{
  const page = await freshPage(ctx);
  await story(page, "Full success path");
  await waitForText(page, "Succeeded", "run succeeded", 10000);

  await page.getByRole("button", { name: "Outputs" }).click();
  await assertNotVisible(page, "No completed runs yet.", "Outputs not empty after succeeded run");
  await assertVisible(page, "Added YouTube as recognized traffic source", "Outputs shows run summary");
  await ss(page, "T9_outputs_after_succeeded");
  await page.close();
}

// ─────────────────────────────────────────────────────────────────────────────
await browser.close();

const failed = results.filter((r) => !r.ok);
const classification = failCount === 0 ? "PASS" : `PARTIAL PASS (${failCount} failures)`;

console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  Atlas Next — Run Lifecycle Contract v1.2                            ║
╠══════════════════════════════════════════════════════════════════════╣
║  PASS  : ${String(passCount).padEnd(61)}║
║  FAIL  : ${String(failCount).padEnd(61)}║
║  TOTAL : ${String(passCount + failCount).padEnd(61)}║
╠══════════════════════════════════════════════════════════════════════╣
${failed.length === 0
  ? "║  ALL ASSERTIONS PASSED                                               ║"
  : failed.map((r) => `║  ✗ ${(r.label + (r.detail ? " — " + r.detail : "")).slice(0, 68).padEnd(68)} ║`).join("\n")
}
╠══════════════════════════════════════════════════════════════════════╣
║  ${classification.padEnd(70)}║
║  PRODUCTION INTEGRATION NOT STARTED                                  ║
╚══════════════════════════════════════════════════════════════════════╝
`);

writeFileSync(`${SS_DIR}/result.json`, JSON.stringify({ pass: passCount, fail: failCount, classification, results }, null, 2));

if (failCount > 0) process.exit(1);
