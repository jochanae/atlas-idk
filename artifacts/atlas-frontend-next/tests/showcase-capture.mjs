/**
 * showcase-capture.mjs — visual validation script for /?showcase=1
 * Run: node artifacts/atlas-frontend-next/tests/showcase-capture.mjs
 */
import { chromium } from "playwright";
import { execSync } from "child_process";
import { mkdirSync } from "fs";

const CHROMIUM = process.env.CHROMIUM_PATH ?? (() => {
  try { return execSync("which chromium", { encoding: "utf8" }).trim(); } catch {}
  try {
    const h = execSync("find /nix/store -maxdepth 3 -name chromium -type f 2>/dev/null | head -1", { encoding: "utf8" }).trim();
    if (h) return h;
  } catch {}
  throw new Error("Chromium not found");
})();

const BASE = process.env.SHOWCASE_URL ?? "http://localhost:80/atlas-next/?showcase=1";
const OUT = process.env.SHOWCASE_SS_DIR ?? "/tmp/showcase-screens";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  headless: true,
});

const consoleErrors = [];
const page = await browser.newPage();
page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
page.on("pageerror", (e) => consoleErrors.push(`PAGE ERROR: ${e.message}`));

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(BASE, { waitUntil: "networkidle", timeout: 20000 });
await page.waitForTimeout(800);

const pageHeight = await page.evaluate(() => document.body.scrollHeight);
console.log(`\nShowcase URL: ${BASE}`);
console.log(`Page height: ${pageHeight}px`);
console.log(`Output dir:  ${OUT}\n`);

// ── Full-page capture ─────────────────────────────────────────────────────────
await page.screenshot({ path: `${OUT}/00_full_page.png`, fullPage: true });
console.log("📸 00_full_page.png (full page)");

// ── Scroll-position captures (8 viewports) ───────────────────────────────────
for (let i = 0; i * 800 < pageHeight; i++) {
  const y = i * 800;
  await page.evaluate((sy) => window.scrollTo(0, sy), y);
  await page.waitForTimeout(100);
  const name = `${String(i + 1).padStart(2, "0")}_scroll_y${y}`;
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`📸 ${name}.png`);
}

// ── Interaction: Changes drawer (Story 3/5) ───────────────────────────────────
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(200);

const changesBtns = page.getByRole("button").filter({ hasText: /^Changes/ });
const nChanges = await changesBtns.count();
console.log(`\nChanges buttons found: ${nChanges}`);
if (nChanges > 0) {
  // First enabled one — story 3 (Changes · 3)
  for (let i = 0; i < nChanges; i++) {
    const btn = changesBtns.nth(i);
    const dis = await btn.isDisabled();
    if (!dis) {
      await btn.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await btn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/INT_01_changes_drawer_open.png` });
      console.log("📸 INT_01_changes_drawer_open.png");
      // Close via ✕ button or Escape
      const closeBtn = page.locator("button").filter({ hasText: /×|✕|close/i });
      if (await closeBtn.count() > 0) await closeBtn.first().click();
      else await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      break;
    }
  }
}

// ── Interaction: Preview drawer (Story 4) ────────────────────────────────────
const previewBtns = page.getByRole("button", { name: "Preview" });
const nPreview = await previewBtns.count();
console.log(`Preview buttons found: ${nPreview}`);
if (nPreview > 0) {
  await previewBtns.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await previewBtns.first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/INT_02_preview_drawer_open.png` });
  console.log("📸 INT_02_preview_drawer_open.png");
  const closeBtn = page.locator("button").filter({ hasText: /×|✕|close/i });
  if (await closeBtn.count() > 0) await closeBtn.first().click();
  else await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

// ── Interaction: Quiet updates toggle (Story 7) ───────────────────────────────
const quietBtns = page.getByRole("button").filter({ hasText: /quiet update/ });
const nQuiet = await quietBtns.count();
console.log(`Quiet-updates buttons found: ${nQuiet}`);
if (nQuiet > 0) {
  await quietBtns.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await quietBtns.first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/INT_03_quiet_updates_expanded.png` });
  console.log("📸 INT_03_quiet_updates_expanded.png");
  // Collapse
  await quietBtns.first().click();
  await page.waitForTimeout(200);
}

// ── Targeted section screenshots ──────────────────────────────────────────────
const targets = [
  ["S1 — Receipt hydration: loading",   "SEC_S1_loading.png"],
  ["S2 — Receipt hydration: empty",     "SEC_S2_empty.png"],
  ["S3 — Receipt hydration: error",     "SEC_S3_error.png"],
  ["S4 — Receipt hydration: disconnected", "SEC_S4_disconnected.png"],
  ["S5 — Commit: running",              "SEC_S5_commit_running.png"],
  ["S6 — Commit: failed",               "SEC_S6_commit_failed.png"],
  ["S7 — Repository feed: loading",     "SEC_S7_feed_loading.png"],
  ["S8 — Repository feed: error",       "SEC_S8_feed_error.png"],
  ["S9 — Repository feed: disconnected","SEC_S9_feed_disconnected.png"],
  ["StatusBadge — all 10",              "SEC_status_badges.png"],
  ["Failed with partial writes",        "SEC_failed_partial.png"],
];

for (const [text, filename] of targets) {
  const el = page.getByText(text, { exact: false }).first();
  if (await el.count() > 0) {
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${OUT}/${filename}` });
    console.log(`📸 ${filename}`);
  } else {
    console.log(`⚠  NOT FOUND: "${text}"`);
  }
}

await browser.close();

console.log(`\n──────────────────────────────────────────`);
console.log(`Console errors during capture: ${consoleErrors.length}`);
if (consoleErrors.length) consoleErrors.slice(0, 10).forEach((e) => console.log(`  ✗ ${e}`));
else console.log("  ✓ none");
