/**
 * Atlas Next — Run Lifecycle Contract v1.2 interactive validation
 * Uses system Chromium (nix store). Run: node scripts/lifecycle-test.mjs
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
  const p = join(SS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  log(`  📸 ${p}`);
  return p;
}

async function assertVisible(page, text, label) {
  const el = page.getByText(text, { exact: false });
  const count = await el.count();
  if (count > 0) {
    pass(label);
  } else {
    fail(label, `"${text}" not found in DOM`);
    await ss(page, `FAIL_${label.replace(/\W+/g, "_").slice(0, 40)}`);
  }
}

async function assertNotVisible(page, text, label) {
  const el = page.getByText(text, { exact: false });
  const count = await el.count();
  if (count === 0) {
    pass(label);
  } else {
    fail(label, `"${text}" unexpectedly found in DOM`);
    await ss(page, `FAIL_${label.replace(/\W+/g, "_").slice(0, 40)}`);
  }
}

async function assertCount(page, selector, expected, label) {
  const count = await page.locator(selector).count();
  if (count === expected) {
    pass(label);
  } else {
    fail(label, `expected ${expected}, got ${count}`);
    await ss(page, `FAIL_${label.replace(/\W+/g, "_").slice(0, 40)}`);
  }
}

async function clickStory(page, label) {
  await page.getByRole("button", { name: label }).click();
  log(`  → Clicked: ${label}`);
}

async function freshPage(ctx) {
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: "networkidle" });
  await p.waitForTimeout(600); // connection dot
  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  headless: true,
});

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// ═══════════════════════════════════════════════════════════════════════════
log("\n══ T1: Zero state ══");
{
  const page = await freshPage(ctx);
  await assertVisible(page, "No runs yet", "zero state — 'No runs yet' visible");
  await assertVisible(page, "Atlas · Next", "header branding");
  await assertVisible(page, "connected", "connection dot shows 'connected'");
  await assertVisible(page, "Full success path", "BUILD story button present");
  await assertNotVisible(page, "Apply changes", "zero state — no Apply button");
  await assertNotVisible(page, "Succeeded", "zero state — no Succeeded badge");

  // Verify all 5 tabs present
  for (const t of ["Chat", "Timeline", "Changes", "Terminal", "Outputs"]) {
    await assertVisible(page, t, `tab '${t}' present`);
  }

  // Verify BUILD buttons enabled (not greyed out / disabled)
  const fullSuccessBtn = page.getByRole("button", { name: "Full success path" });
  const isDisabled = await fullSuccessBtn.isDisabled();
  isDisabled ? fail("BUILD buttons enabled at zero state") : pass("BUILD buttons enabled at zero state");

  await ss(page, "T1_zero_state");
  await page.close();
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n══ T2: BUILD full success path — state progression ══");
{
  const page = await freshPage(ctx);
  await clickStory(page, "Full success path");

  // thinking (150ms)
  await page.waitForTimeout(400);
  await assertVisible(page, "Thinking", "T2.1 — thinking badge visible");
  await assertVisible(page, "Atlas is thinking", "T2.1 — ThinkingIndicator visible");
  await assertNotVisible(page, "Apply changes", "T2.1 — no Apply during thinking");
  await assertNotVisible(page, "No runs yet", "T2.1 — zero-state gone after run created");
  await ss(page, "T2a_thinking");

  // planning (500ms) + plan_ready (1100ms) — plan card appears
  await page.waitForTimeout(900); // total ~1.3s
  await assertVisible(page, "Planning", "T2.2 — planning badge");

  await page.waitForTimeout(500); // total ~1.8s — past 1100ms plan_ready
  await assertVisible(page, "Add YouTube as a recognized traffic source", "T2.3 — PlanCard title (plan_ready)");
  await assertVisible(page, "trafficMap.ts", "T2.3 — plan item file visible");
  await ss(page, "T2b_planning_with_plan");

  // awaiting_confirmation (1400ms)
  await page.waitForTimeout(200); // total ~2.0s
  await assertVisible(page, "Awaiting confirmation", "T2.4 — awaiting_confirmation badge");
  await assertVisible(page, "Apply changes", "T2.4 — Apply button visible");
  await assertVisible(page, "Cancel", "T2.4 — Cancel button visible");
  await assertNotVisible(page, "Step", "T2.4 — no step counter during awaiting");
  await ss(page, "T2c_awaiting_confirmation");

  // Verify exactly 1 PlanCard (One Live Card Rule)
  const planCards = await page.locator("button:has-text('Apply changes')").count();
  planCards === 1 ? pass("T2.4 — exactly one Apply button (one live BUILD card)") : fail("T2.4 — one live BUILD card", `found ${planCards} Apply buttons`);

  // executing (auto-confirm at 2600ms)
  await page.waitForTimeout(900); // total ~2.9s
  await assertVisible(page, "Executing", "T2.5 — executing badge");
  await assertNotVisible(page, "Apply changes", "T2.5 — Apply button gone after confirm");
  await assertVisible(page, "Step", "T2.5 — step counter visible during executing");
  await ss(page, "T2d_executing");

  // testing (4600ms)
  await page.waitForTimeout(2000); // total ~4.9s
  await assertVisible(page, "Testing", "T2.6 — testing badge");
  await ss(page, "T2e_testing");

  // verifying (5300ms)
  await page.waitForTimeout(700); // total ~5.6s
  await assertVisible(page, "Verifying", "T2.7 — verifying badge");
  await ss(page, "T2f_verifying");

  // succeeded receipt (6100ms)
  await page.waitForTimeout(900); // total ~6.5s
  await assertVisible(page, "Succeeded", "T2.8 — succeeded badge in ReceiptChip");
  await assertVisible(page, "Added YouTube as recognized traffic source", "T2.8 — run summary in receipt");
  await assertVisible(page, "Commit to GitHub", "T2.8 — Commit button on succeeded BUILD");

  // Verify PlanCard (Apply/Cancel) is GONE — replaced by ReceiptChip
  await assertNotVisible(page, "Apply changes", "T2.8 — Apply/Cancel gone after terminal (one card rule)");
  await ss(page, "T2g_succeeded_receipt");

  // BUILD buttons re-enabled after terminal
  const fullBtn = page.getByRole("button", { name: "Full success path" });
  const stillDisabled = await fullBtn.isDisabled();
  stillDisabled ? fail("T2.8 — BUILD buttons re-enabled after succeeded") : pass("T2.8 — BUILD buttons re-enabled after succeeded");

  // Commit flow
  await page.getByRole("button", { name: "Commit to GitHub" }).click();
  await page.waitForTimeout(1100); // 900ms mocked delay + buffer
  await assertVisible(page, "a1b2c3", "T2.9 — commit SHA link visible after commit");
  await assertNotVisible(page, "Commit to GitHub", "T2.9 — Commit button gone after commit");
  await ss(page, "T2h_committed");

  await page.close();
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n══ T3: Gate 1 — Apply changes ══");
{
  const page = await freshPage(ctx);
  await clickStory(page, "Stop at confirmation (Gate 1)");

  await page.waitForTimeout(2000); // past 1400ms
  await assertVisible(page, "Awaiting confirmation", "T3.1 — awaiting_confirmation state");
  await assertVisible(page, "Apply changes", "T3.1 — Apply button present");

  // Click Apply changes
  await page.getByRole("button", { name: "Apply changes" }).click();
  await page.waitForTimeout(300);

  await assertVisible(page, "Executing", "T3.2 — status → executing after Apply");
  await assertNotVisible(page, "Apply changes", "T3.2 — Apply button gone after confirm");
  await assertNotVisible(page, "Cancel", "T3.2 — Cancel button gone after confirm");
  // PlanCard still rendered (not replaced by receipt — executing is non-terminal)
  await assertVisible(page, "Add YouTube as a recognized traffic source", "T3.2 — PlanCard still rendered (executing)");

  // BUILD buttons remain disabled (activeBuildRun non-null, stuck executing)
  const btn = page.getByRole("button", { name: "Full success path" });
  const disabled = await btn.isDisabled();
  disabled ? pass("T3.2 — BUILD buttons locked while executing") : fail("T3.2 — BUILD buttons locked while executing");

  await ss(page, "T3_gate1_applied");
  await page.close();
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n══ T4: Gate 1 — Cancel (no partial-write warning) ══");
{
  const page = await freshPage(ctx);
  await clickStory(page, "Stop at confirmation (Gate 1)");
  await page.waitForTimeout(2000);
  await assertVisible(page, "Awaiting confirmation", "T4.1 — at gate");

  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(300);

  await assertVisible(page, "Cancelled", "T4.2 — cancelled badge in receipt");
  await assertNotVisible(page, "Some files may have been partially updated", "T4.2 — NO partial-write warning (cancelled at gate, not mid-exec)");
  await assertNotVisible(page, "Apply changes", "T4.2 — no Apply button after cancel");

  // BUILD buttons re-enabled
  const btn = page.getByRole("button", { name: "Full success path" });
  const disabled = await btn.isDisabled();
  disabled ? fail("T4.2 — BUILD buttons re-enabled after cancel") : pass("T4.2 — BUILD buttons re-enabled after cancel");

  await ss(page, "T4_cancelled_no_partial_warning");
  await page.close();
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n══ T5: Fail mid-execution — TOOL_FAILURE + partial-write warning ══");
{
  const page = await freshPage(ctx);
  await clickStory(page, "Fail mid-execution (partial writes)");

  // auto-confirms at 2600ms, fails at 4600ms
  await page.waitForTimeout(5500);

  await assertVisible(page, "Failed", "T5.1 — failed badge");
  await assertVisible(page, "TOOL_FAILURE", "T5.2 — error code visible");
  await assertVisible(page, "TypeScript check failed on src/lib/trafficMap.ts (line 42).", "T5.3 — error message");
  await assertVisible(page, "Some files may have been partially updated. Review the Changes tab.", "T5.4 — partial-write warning visible");
  await assertNotVisible(page, "Apply changes", "T5.5 — no Apply on terminal state");

  const btn = page.getByRole("button", { name: "Full success path" });
  const disabled = await btn.isDisabled();
  disabled ? fail("T5.5 — BUILD buttons re-enabled after fail") : pass("T5.5 — BUILD buttons re-enabled after fail");

  await ss(page, "T5_failed_partial_write");
  await page.close();
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n══ T6: Concurrent BUILD + CHAT ══");
{
  const page = await freshPage(ctx);

  // Start BUILD at gate
  await clickStory(page, "Stop at confirmation (Gate 1)");
  await page.waitForTimeout(2000);
  await assertVisible(page, "Awaiting confirmation", "T6.1 — BUILD at awaiting_confirmation");

  // CHAT button should be enabled (BUILD does not block CHAT)
  const chatBtn = page.getByRole("button", { name: "Send chat turn" });
  const chatDisabled = await chatBtn.isDisabled();
  chatDisabled ? fail("T6.1 — Send chat turn enabled while BUILD is active") : pass("T6.1 — Send chat turn enabled while BUILD is active");

  // Start CHAT turn simultaneously
  await clickStory(page, "Send chat turn");
  await page.waitForTimeout(400);

  // Both must be visible simultaneously
  await assertVisible(page, "Awaiting confirmation", "T6.2 — BUILD PlanCard still shows awaiting_confirmation");
  await assertVisible(page, "Apply changes", "T6.2 — Apply button still present (BUILD unchanged)");
  await assertVisible(page, "Thinking", "T6.2 — CHAT ThinkingIndicator badge visible");
  await assertVisible(page, "Atlas is thinking", "T6.2 — CHAT ThinkingIndicator text visible");

  // Only ONE Apply button (one BUILD card)
  const applyCount = await page.locator("button:has-text('Apply changes')").count();
  applyCount === 1 ? pass("T6.2 — exactly one Apply button (BUILD card not duplicated)") : fail("T6.2 — one BUILD card rule", `${applyCount} Apply buttons`);

  await ss(page, "T6a_concurrent_build_chat");

  // CHAT completes (1200ms total from click)
  await page.waitForTimeout(1200);
  // CHAT receipt — ChatSurface only renders BUILD receipts, not CHAT receipts as chips
  // The CHAT run completes but its receipt is not rendered as a visible card (by design)
  // The BUILD PlanCard is unchanged
  await assertVisible(page, "Apply changes", "T6.3 — BUILD Apply still present after CHAT completes");
  await assertVisible(page, "Awaiting confirmation", "T6.3 — BUILD still at awaiting_confirmation");

  // CHAT button re-enabled (activeTurn is null again)
  const chatDisabled2 = await chatBtn.isDisabled();
  chatDisabled2 ? fail("T6.3 — CHAT button re-enabled after turn completes") : pass("T6.3 — CHAT button re-enabled after turn completes");

  await ss(page, "T6b_after_chat_complete");
  await page.close();
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n══ T7: Tab consistency — Timeline, Changes, Terminal, Outputs ══");
{
  const page = await freshPage(ctx);
  await clickStory(page, "Stop at confirmation (Gate 1)");
  await page.waitForTimeout(2000); // at awaiting_confirmation

  // Timeline tab
  await page.getByRole("button", { name: "Timeline" }).click();
  await page.waitForTimeout(200);
  await assertVisible(page, "BUILD", "T7.1 — Timeline shows BUILD intent");
  await assertVisible(page, "Add YouTube as a recognized traffic source", "T7.1 — Timeline shows plan title");
  await assertVisible(page, "Awaiting confirmation", "T7.1 — Timeline shows current status badge");
  await assertNotVisible(page, "No runs yet.", "T7.1 — Timeline not empty");
  await ss(page, "T7a_timeline_tab");

  // Changes tab
  await page.getByRole("button", { name: "Changes" }).click();
  await page.waitForTimeout(200);
  await assertVisible(page, "src/lib/trafficMap.ts", "T7.2 — Changes shows file path 1");
  await assertVisible(page, "src/components/TrafficChannels.tsx", "T7.2 — Changes shows file path 2");
  await assertVisible(page, "src/lib/trafficMap.test.ts", "T7.2 — Changes shows file path 3");
  await assertNotVisible(page, "No BUILD run to show changes for.", "T7.2 — Changes not empty");
  await ss(page, "T7b_changes_tab");

  // Terminal tab
  await page.getByRole("button", { name: "Terminal" }).click();
  await page.waitForTimeout(200);
  await assertVisible(page, "atlas run", "T7.3 — Terminal shows run command");
  await assertVisible(page, "Add YouTube", "T7.3 — Terminal shows plan title");
  await assertNotVisible(page, "No active build", "T7.3 — Terminal not empty");
  await ss(page, "T7c_terminal_tab");

  // Outputs tab — empty because no succeeded runs
  await page.getByRole("button", { name: "Outputs" }).click();
  await page.waitForTimeout(200);
  await assertVisible(page, "No completed runs yet.", "T7.4 — Outputs empty (no succeeded runs yet)");
  await ss(page, "T7d_outputs_tab_empty");

  // Apply and complete a build so Outputs has content
  await page.getByRole("button", { name: "Chat" }).click();
  await page.close();
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n══ T8: Refresh resets mocked state (Phase 1 expected behavior) ══");
{
  const page = await freshPage(ctx);
  await clickStory(page, "Stop at confirmation (Gate 1)");
  await page.waitForTimeout(2000);
  await assertVisible(page, "Awaiting confirmation", "T8.1 — state live before refresh");
  await ss(page, "T8a_before_refresh");

  // Reload
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  await assertVisible(page, "No runs yet", "T8.2 — refresh resets to zero state (in-memory only, expected in Phase 1)");
  await assertNotVisible(page, "Awaiting confirmation", "T8.2 — no stale state after refresh");
  await ss(page, "T8b_after_refresh");
  await page.close();
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n══ T9: Outputs tab populates after succeeded run ══");
{
  const page = await freshPage(ctx);
  await clickStory(page, "Full success path");
  await page.waitForTimeout(7000); // wait for run_complete(succeeded) at 6100ms + buffer
  await assertVisible(page, "Succeeded", "T9.1 — run succeeded");

  await page.getByRole("button", { name: "Outputs" }).click();
  await page.waitForTimeout(200);
  await assertNotVisible(page, "No completed runs yet.", "T9.2 — Outputs not empty after succeeded run");
  await assertVisible(page, "Added YouTube as recognized traffic source", "T9.2 — Outputs shows run summary");
  await ss(page, "T9_outputs_after_succeeded");
  await page.close();
}

// ═══════════════════════════════════════════════════════════════════════════
await browser.close();

// ─── Final report ─────────────────────────────────────────────────────────
log("\n╔══════════════════════════════════════════════════════════════════════╗");
log(`║  LIFECYCLE VALIDATION RESULTS                                        ║`);
log("╠══════════════════════════════════════════════════════════════════════╣");
log(`║  PASS: ${String(passCount).padEnd(62)}║`);
log(`║  FAIL: ${String(failCount).padEnd(62)}║`);
log(`║  TOTAL: ${String(passCount + failCount).padEnd(61)}║`);
log("╠══════════════════════════════════════════════════════════════════════╣");

const failed = results.filter(r => !r.ok);
if (failed.length === 0) {
  log("║  ALL ASSERTIONS PASSED                                               ║");
} else {
  log("║  FAILURES:                                                           ║");
  failed.forEach(r => log(`║  ✗ ${r.label.slice(0, 50).padEnd(50)} ${(r.detail || "").slice(0, 10).padEnd(10)} ║`));
}
log("╠══════════════════════════════════════════════════════════════════════╣");
const classification = failCount === 0
  ? "MOCKED FRONTEND PASS"
  : `MOCKED FRONTEND PARTIAL PASS (${failCount} failures)`;
log(`║  ${classification.padEnd(70)}║`);
log("║  PRODUCTION INTEGRATION NOT STARTED                                  ║");
log("╚══════════════════════════════════════════════════════════════════════╝");

log("\nScreenshots saved to: " + SS_DIR);

// Write JSON result for CI/reference
writeFileSync("/tmp/lifecycle-result.json", JSON.stringify({
  pass: passCount, fail: failCount,
  classification,
  results,
  screenshots: SS_DIR,
}, null, 2));
