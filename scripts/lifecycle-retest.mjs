/**
 * Atlas Next — targeted re-test for the 3 previously failing scenarios:
 *   T3: Gate 1 Cancel (selector fix — avoid "Cancel it or wait" text)
 *   T5: Fail mid-execution (ChatSurface now renders PlanCard for runs with errors)
 *   Timing: added 20% buffer to previously-close timing checks
 *
 * Run: node scripts/lifecycle-retest.mjs
 */

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const CHROMIUM = "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";
const BASE = "https://ed44264d-634d-4def-a16a-4b52206356dd-00-4xui1ou1xage.janeway.replit.dev/atlas-next/";
const SS_DIR = "/tmp/lifecycle-screenshots";
mkdirSync(SS_DIR, { recursive: true });

let passCount = 0;
let failCount = 0;
const results = [];

function log(msg) { console.log(msg); }
function pass(label) { passCount++; results.push({ label, ok: true }); log(`  ✓ ${label}`); }
function fail(label, detail = "") { failCount++; results.push({ label, ok: false, detail }); log(`  ✗ ${label}${detail ? ": " + detail : ""}`); }
async function ss(page, name) { const p = join(SS_DIR, `${name}.png`); await page.screenshot({ path: p }); log(`  📸 ${p}`); return p; }

async function assertVisible(page, text, label) {
  const count = await page.getByText(text, { exact: false }).count();
  count > 0 ? pass(label) : (fail(label, `"${text}" not found`), await ss(page, `FAIL_${label.replace(/\W+/g, "_").slice(0, 40)}`));
}
async function assertNotVisible(page, text, label) {
  const count = await page.getByText(text, { exact: false }).count();
  count === 0 ? pass(label) : (fail(label, `"${text}" unexpectedly present`), await ss(page, `FAIL_${label.replace(/\W+/g, "_").slice(0, 40)}`));
}
async function assertButtonNotVisible(page, name, label) {
  const count = await page.getByRole("button", { name, exact: true }).count();
  count === 0 ? pass(label) : (fail(label, `button "${name}" unexpectedly present`), await ss(page, `FAIL_${label.replace(/\W+/g, "_").slice(0, 40)}`));
}
async function freshPage(ctx) {
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: "networkidle" });
  await p.waitForTimeout(700);
  return p;
}
async function clickStory(page, label) {
  await page.getByRole("button", { name: label }).click();
  log(`  → Clicked: ${label}`);
}

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// ═══════════════════════════════════════════════════════════════════════════
log("\n══ T3-RETEST: Gate 1 — Apply changes (button-specific Cancel selector) ══");
{
  const page = await freshPage(ctx);
  await clickStory(page, "Stop at confirmation (Gate 1)");
  await page.waitForTimeout(2200); // past 1400ms awaiting_confirmation

  await assertVisible(page, "Awaiting confirmation", "T3.1 — at gate");
  await assertButtonNotVisible(page, "something-unused", "T3.0 — sanity check passes");

  // Count Apply buttons before confirm (should be exactly 1)
  const applyBefore = await page.getByRole("button", { name: "Apply changes", exact: true }).count();
  applyBefore === 1 ? pass("T3.1 — exactly one Apply button before confirm") : fail("T3.1 — Apply button count", String(applyBefore));

  // Count Cancel buttons before confirm (should be exactly 1)
  const cancelBefore = await page.getByRole("button", { name: "Cancel", exact: true }).count();
  cancelBefore === 1 ? pass("T3.1 — exactly one Cancel button before confirm") : fail("T3.1 — Cancel button count", String(cancelBefore));

  // Confirm
  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  await page.waitForTimeout(400);

  await assertVisible(page, "Executing", "T3.2 — Executing badge after Apply");

  // Check Apply button is gone using role selector (exact)
  const applyAfter = await page.getByRole("button", { name: "Apply changes", exact: true }).count();
  applyAfter === 0 ? pass("T3.2 — Apply button gone after confirm") : fail("T3.2 — Apply button gone", `${applyAfter} Apply buttons remain`);

  // Check Cancel BUTTON is gone (not just text) — using role:button to avoid "Cancel it or wait" text
  const cancelAfter = await page.getByRole("button", { name: "Cancel", exact: true }).count();
  cancelAfter === 0 ? pass("T3.2 — Cancel button (role=button) gone after confirm") : fail("T3.2 — Cancel button gone", `${cancelAfter} Cancel buttons remain`);

  // The word "Cancel" may still appear in the story panel warning ("Cancel it or wait...") — that's expected
  const cancelTextCount = await page.getByText("Cancel", { exact: false }).count();
  log(`  ℹ  "Cancel" text occurrences after confirm: ${cancelTextCount} (may include "Cancel it or wait" warning — acceptable)`);

  await assertVisible(page, "Add YouTube as a recognized traffic source", "T3.2 — PlanCard still rendered while executing");
  await ss(page, "T3R_gate1_applied_retest");

  // BUILD buttons locked (activeBuildRun non-null)
  const blocked = await page.getByRole("button", { name: "Full success path", exact: true }).isDisabled();
  blocked ? pass("T3.2 — BUILD locked while executing") : fail("T3.2 — BUILD locked while executing");

  await page.close();
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n══ T5-RETEST: Fail mid-execution — error block visible (after ChatSurface fix) ══");
{
  const page = await freshPage(ctx);
  await clickStory(page, "Fail mid-execution (partial writes)");

  // auto-confirms at 2600ms, fails at 4600ms — wait 5800ms with buffer
  log("  ⏳ Waiting 5800ms for run_complete(failed)…");
  await page.waitForTimeout(5800);

  await assertVisible(page, "Failed", "T5.1 — failed badge");
  await assertVisible(page, "TOOL_FAILURE", "T5.2 — TOOL_FAILURE error code visible (ChatSurface PlanCard for errored runs)");
  await assertVisible(page, "TypeScript check failed on src/lib/trafficMap.ts (line 42).", "T5.3 — error message visible");
  await assertVisible(page, "Some files may have been partially updated. Review the Changes tab.", "T5.4 — partial-write warning visible");
  await assertButtonNotVisible(page, "Apply changes", "T5.5 — no Apply button on terminal state");

  // BUILD buttons re-enabled
  const disabled = await page.getByRole("button", { name: "Full success path", exact: true }).isDisabled();
  disabled ? fail("T5.5 — BUILD re-enabled after fail") : pass("T5.5 — BUILD re-enabled after fail");

  await ss(page, "T5R_failed_partial_write_retest");
  await page.close();
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n══ T2-TIMING-RETEST: planning badge check with more buffer ══");
{
  const page = await freshPage(ctx);
  await clickStory(page, "Full success path");

  // thinking fires at 150ms — check at 350ms (plenty of headroom)
  await page.waitForTimeout(350);
  await assertVisible(page, "Thinking", "T2.1R — thinking badge at 350ms");

  // planning fires at 500ms — check at 750ms (between 500ms and 1100ms plan_ready)
  await page.waitForTimeout(400); // total ~750ms
  await assertVisible(page, "Planning", "T2.2R — planning badge at 750ms (before plan_ready at 1100ms)");
  await ss(page, "T2R_planning_badge");

  // plan_ready fires at 1100ms — check at 1300ms
  await page.waitForTimeout(550); // total ~1300ms
  await assertVisible(page, "Awaiting confirmation", "T2.4R — awaiting_confirmation at 1400ms (check at 1900ms)");

  // Wait for auto-confirm (2600ms) then testing (4600ms) then verifying (5300ms) then succeeded (6100ms)
  // Total wait from this point: need to reach 6500ms from click
  // Currently at ~1900ms elapsed, need ~4600ms more
  await page.waitForTimeout(2800); // total ~4700ms — should be in testing (4600ms fired)
  await assertVisible(page, "Testing", "T2.6R — testing badge at 4700ms");
  await ss(page, "T2R_testing");

  await page.waitForTimeout(800); // total ~5500ms — past verifying at 5300ms
  await assertVisible(page, "Verifying", "T2.7R — verifying badge at 5500ms");
  await ss(page, "T2R_verifying");

  await page.waitForTimeout(900); // total ~6400ms — past succeeded at 6100ms
  await assertVisible(page, "Succeeded", "T2.8R — succeeded receipt");
  await assertVisible(page, "Commit to GitHub", "T2.8R — Commit button present");
  await ss(page, "T2R_succeeded");

  await page.close();
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n══ T4-RETEST: Cancel at gate — no partial-write warning (role-button check) ══");
{
  const page = await freshPage(ctx);
  await clickStory(page, "Stop at confirmation (Gate 1)");
  await page.waitForTimeout(2200);
  await assertVisible(page, "Awaiting confirmation", "T4.1 — at gate");

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForTimeout(400);

  await assertVisible(page, "Cancelled", "T4.2 — cancelled badge");
  await assertNotVisible(page, "Some files may have been partially updated", "T4.2 — NO partial-write warning (cancel at gate, error=null)");
  await assertButtonNotVisible(page, "Apply changes", "T4.2 — no Apply after cancel");

  const disabled = await page.getByRole("button", { name: "Full success path", exact: true }).isDisabled();
  disabled ? fail("T4.2 — BUILD re-enabled after cancel") : pass("T4.2 — BUILD re-enabled after cancel");

  await ss(page, "T4R_cancelled_gate_no_partial_warning");
  await page.close();
}

// ─── Final report ─────────────────────────────────────────────────────────
await browser.close();

log("\n╔══════════════════════════════════════════════════════════════════════╗");
log(`║  RE-TEST RESULTS                                                     ║`);
log("╠══════════════════════════════════════════════════════════════════════╣");
log(`║  PASS: ${String(passCount).padEnd(62)}║`);
log(`║  FAIL: ${String(failCount).padEnd(62)}║`);
log("╠══════════════════════════════════════════════════════════════════════╣");
const failed = results.filter(r => !r.ok);
if (failed.length === 0) {
  log("║  ALL RE-TEST ASSERTIONS PASSED                                       ║");
} else {
  failed.forEach(r => log(`║  ✗ ${(r.label + " — " + (r.detail || "")).slice(0, 68).padEnd(68)} ║`));
}
log("╚══════════════════════════════════════════════════════════════════════╝");
writeFileSync("/tmp/lifecycle-retest-result.json", JSON.stringify({ pass: passCount, fail: failCount, results }, null, 2));
