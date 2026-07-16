/**
 * Authenticated browser probe for Library → Draft Preview HTML retrieval.
 *
 * Prefers PLAYWRIGHT_BASE_URL (default https://axiomsystem.app).
 * Auth via:
 *   - ATLAS_SESSION cookie env, or
 *   - storage state file PLAYWRIGHT_STORAGE_STATE, or
 *   - /api/auth/dev-test-login?userId=N when BASE is local/dev
 */
import { chromium } from "playwright";

const base = (process.env.PLAYWRIGHT_BASE_URL || "https://axiomsystem.app").replace(/\/$/, "");
const projectId = process.env.PROBE_PROJECT_ID || "260";
const artifactId = process.env.PROBE_ARTIFACT_ID || "680";
const path = `/api/projects/${projectId}/artifacts/${artifactId}/download`;
const url = `${base}${path}`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext(
  process.env.PLAYWRIGHT_STORAGE_STATE
    ? { storageState: process.env.PLAYWRIGHT_STORAGE_STATE }
    : {},
);

if (process.env.ATLAS_SESSION) {
  await context.addCookies([{
    name: "atlas-session",
    value: process.env.ATLAS_SESSION,
    url: base,
    httpOnly: true,
    sameSite: "Lax",
  }]);
}

const page = await context.newPage();

// Dev login path for local stacks
if (process.env.DEV_TEST_USER_ID) {
  await page.goto(`${base}/api/auth/dev-test-login?userId=${process.env.DEV_TEST_USER_ID}&redirect=/home`, {
    waitUntil: "domcontentloaded",
  });
} else {
  // Establish document origin so relative /api fetch works with credentials.
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" }).catch(() => {});
}

const result = await page.evaluate(async ({ downloadPath, absoluteUrl }) => {
  const res = await fetch(downloadPath, { credentials: "include" }).catch(() => null)
    ?? await fetch(absoluteUrl, { credentials: "include" });
  const contentType = res.headers.get("content-type");
  const contentDisposition = res.headers.get("content-disposition");
  const body = await res.text();
  const trimmed = body.trimStart();
  const beginsWithDoctype = /^<!DOCTYPE\s+html/i.test(trimmed);
  const beginsWithHtml = /^<html[\s>]/i.test(trimmed);
  return {
    status: res.status,
    contentType,
    contentDisposition,
    bodyLength: body.length,
    beginsWithDoctype,
    beginsWithHtml,
    usable: res.ok && (beginsWithDoctype || beginsWithHtml),
  };
}, { downloadPath: path, absoluteUrl: url });

console.log(JSON.stringify({ url, ...result }, null, 2));
await browser.close();
process.exit(result.usable ? 0 : 1);
