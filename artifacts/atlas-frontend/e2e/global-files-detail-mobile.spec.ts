import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const ARTIFACTS_DIR = process.env.CURSOR_ARTIFACTS_DIR
  ?? "/opt/cursor/artifacts/global-files-detail";

const COMPLETED = {
  id: "11111111-1111-1111-1111-111111111111",
  kind: "document",
  // Keep title ASCII-stable for Chromium screenshot compositing at mobile DPR.
  title: "Product Brief.pdf",
  preview: "Generated document \"Product Brief\" (6 sections).",
  project: { id: 42, name: "Aura Focus Timer for Indie Developers" },
  origin: { source: "workspace", conversationId: "conv-1" },
  sourceRef: {
    sourceKind: "project-artifact",
    sourceId: "9001",
    artifactType: "pdf",
    projectId: 42,
    conversationId: "conv-1",
  },
  createdAt: "2026-07-23T16:27:43.000Z",
  updatedAt: "2026-07-23T16:27:43.000Z",
};

const FAILED = {
  id: "22222222-2222-2222-2222-222222222222",
  kind: "sketch",
  title: "Incomplete HTML prototype",
  preview: "Generation may have been cut off before completing. HTML tags look unbalanced — the markup may be incomplete.",
  content: "Generation may have been cut off before completing.",
  project: { id: 42, name: "Aura Focus Timer for Indie Developers" },
  origin: { source: "workspace", conversationId: "conv-2" },
  sourceRef: {
    sourceKind: "project-artifact",
    sourceId: "9002",
    artifactType: "html-app",
    projectId: 42,
    conversationId: "conv-2",
  },
  createdAt: "2026-07-22T12:00:00.000Z",
  updatedAt: "2026-07-22T12:00:00.000Z",
};

async function mockApis(page: Page) {
  let items = [COMPLETED, FAILED];

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname === "/api/auth/me") {
      return route.fulfill({
        json: {
          id: 1, email: "test@example.com", name: "Test", avatarUrl: null,
          role: "user", subscriptionTier: "pro", googleLinked: false, hasPassword: true,
        },
      });
    }
    if (url.pathname === "/api/projects") {
      return route.fulfill({
        json: [{ id: 42, name: "Aura Focus Timer for Indie Developers", status: "committed", updatedAt: "2026-07-23T12:00:00.000Z" }],
      });
    }
    if (url.pathname === "/api/library" && method === "GET") {
      return route.fulfill({ json: { items } });
    }
    if (url.pathname.startsWith("/api/library/") && method === "DELETE") {
      const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      items = items.filter((it) => it.id !== id);
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname.includes("/api/fs/")) {
      return route.fulfill({ json: { workspaceDir: "/tmp", children: [] } });
    }
    return route.fulfill({ json: [] });
  });
}

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width <= b.x
    || b.x + b.width <= a.x
    || a.y + a.height <= b.y
    || b.y + b.height <= a.y
  );
}

function assertOpaqueFill(color: string) {
  // Reject transparent / zero-alpha fills that let the list paint through.
  expect(color).not.toMatch(/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/);
  const alpha = color.match(/rgba\([^)]+,\s*([0-9.]+)\s*\)/);
  if (alpha) expect(Number(alpha[1])).toBeGreaterThan(0.95);
}

test.describe("Global Files mobile detail presentation", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("completed + failed artifacts: no overlap, actions tappable, clean close", async ({ page }) => {
    await mockApis(page);
    await page.addInitScript(() => localStorage.setItem("atlas-auth-token", "e2e-token"));
    await page.goto("/files");

    // Wait for list rows
    await expect(page.getByText("Product Brief.pdf")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Incomplete HTML prototype")).toBeVisible();
    // Guard: page transition orb must not sit above the detail sheet.
    await expect(page.getByText("thinking strategically")).toHaveCount(0);

    // ── Completed artifact ───────────────────────────────────────────────
    await page.getByText("Product Brief.pdf").click();
    const completedPanel = page.getByTestId("files-preview-panel");
    await expect(completedPanel).toBeVisible();
    await expect(completedPanel).toHaveAttribute("data-artifact-health", "ok");

    // Full-screen sheet: panel covers nearly the viewport (not a side strip).
    const panelBox = await completedPanel.boundingBox();
    expect(panelBox).toBeTruthy();
    expect(panelBox!.width).toBeGreaterThan(360);
    expect(panelBox!.height).toBeGreaterThan(700);

    const scrim = page.getByTestId("files-preview-scrim");
    await expect(scrim).toBeVisible();

    // Opaque paint — this is the actual stacked-list failure mode.
    const fills = await page.evaluate(() => {
      const panel = document.querySelector("[data-testid=files-preview-panel]");
      const s = document.querySelector("[data-testid=files-preview-scrim]");
      return {
        panel: getComputedStyle(panel!).backgroundColor,
        scrim: getComputedStyle(s!).backgroundColor,
      };
    });
    assertOpaqueFill(fills.panel);
    assertOpaqueFill(fills.scrim);

    // Pixel under the page "Files" heading must be covered by the opaque sheet
    // (Playwright's toBeHidden ignores occlusion).
    const headingCovered = await page.evaluate(() => {
      const h = document.querySelector("h1");
      if (!h) return false;
      const r = h.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!el?.closest("[data-testid=files-preview-panel], [data-testid=files-preview-scrim]");
    });
    expect(headingCovered).toBe(true);

    // Metadata rows must not overlap each other or the title.
    const titleBox = await page.getByTestId("files-preview-title").boundingBox();
    const metaPath = await page.getByTestId("files-meta-path").boundingBox();
    const metaType = await page.getByTestId("files-meta-type").boundingBox();
    const metaUpdated = await page.getByTestId("files-meta-updated").boundingBox();
    const footerBox = await page.getByTestId("files-preview-footer").boundingBox();
    const summaryBox = await page.getByTestId("files-preview-summary").boundingBox();

    expect(titleBox && metaPath && metaType && metaUpdated && footerBox).toBeTruthy();
    expect(boxesOverlap(titleBox!, metaPath!)).toBe(false);
    expect(boxesOverlap(metaPath!, metaType!)).toBe(false);
    expect(boxesOverlap(metaType!, metaUpdated!)).toBe(false);
    if (summaryBox) {
      expect(boxesOverlap(summaryBox, footerBox!)).toBe(false);
      expect(boxesOverlap(summaryBox, titleBox!)).toBe(false);
    }
    expect(boxesOverlap(metaUpdated!, footerBox!)).toBe(false);

    // Buttons visible + tappable
    await expect(page.getByTestId("files-preview-delete")).toBeVisible();
    await expect(page.getByTestId("files-preview-open")).toBeVisible();
    await expect(page.getByTestId("files-preview-close-btn")).toBeVisible();
    await expect(page.getByTestId("files-preview-title")).toHaveText("Product Brief.pdf");
    await page.evaluate(async () => { await document.fonts.ready; });

    await completedPanel.screenshot({
      path: path.join(ARTIFACTS_DIR, "completed-artifact-detail-mobile.png"),
    });
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "completed-artifact-detail-page.png"),
    });

    // Close returns to list
    await page.getByTestId("files-preview-close-btn").click();
    await expect(completedPanel).toHaveCount(0);
    await expect(page.getByText("Product Brief.pdf")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();
    const headingExposed = await page.evaluate(() => {
      const h = document.querySelector("h1");
      if (!h) return false;
      const r = h.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el === h || !!el?.closest("header");
    });
    expect(headingExposed).toBe(true);

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "after-close-completed-mobile.png"),
      animations: "disabled",
    });

    // ── Failed / partial artifact ────────────────────────────────────────
    await page.getByText("Incomplete HTML prototype").click();
    const failedPanel = page.getByTestId("files-preview-panel");
    await expect(failedPanel).toBeVisible();
    await expect(failedPanel).toHaveAttribute("data-artifact-health", "partial");
    await expect(page.getByTestId("files-preview-health")).toContainText(/Partial|incomplete/i);
    await expect(page.getByText("Partial", { exact: true })).toBeVisible();

    const failedFills = await page.evaluate(() => {
      const panel = document.querySelector("[data-testid=files-preview-panel]");
      const s = document.querySelector("[data-testid=files-preview-scrim]");
      return {
        panel: getComputedStyle(panel!).backgroundColor,
        scrim: getComputedStyle(s!).backgroundColor,
      };
    });
    assertOpaqueFill(failedFills.panel);
    assertOpaqueFill(failedFills.scrim);
    const failedHeadingCovered = await page.evaluate(() => {
      const h = document.querySelector("h1");
      if (!h) return false;
      const r = h.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!el?.closest("[data-testid=files-preview-panel], [data-testid=files-preview-scrim]");
    });
    expect(failedHeadingCovered).toBe(true);

    const failedTitle = await page.getByTestId("files-preview-title").boundingBox();
    const failedHealth = await page.getByTestId("files-preview-health").boundingBox();
    const failedFooter = await page.getByTestId("files-preview-footer").boundingBox();
    expect(failedTitle && failedHealth && failedFooter).toBeTruthy();
    expect(boxesOverlap(failedTitle!, failedHealth!)).toBe(false);
    expect(boxesOverlap(failedHealth!, failedFooter!)).toBe(false);

    await expect(page.getByTestId("files-preview-delete")).toBeVisible();
    await expect(page.getByTestId("files-preview-open")).toBeVisible();

    await failedPanel.screenshot({
      path: path.join(ARTIFACTS_DIR, "failed-artifact-detail-mobile.png"),
      animations: "disabled",
    });
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "failed-artifact-detail-page.png"),
      animations: "disabled",
    });

    // Delete path (confirm dialog)
    page.once("dialog", (d) => d.accept());
    await page.getByTestId("files-preview-delete").click();
    await expect(failedPanel).toHaveCount(0);
    await expect(page.getByText("Incomplete HTML prototype")).toHaveCount(0);
    await expect(page.getByText("Product Brief.pdf")).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "after-delete-failed-mobile.png"),
      animations: "disabled",
    });

    // Completed artifact can also be deleted
    await page.getByText("Product Brief.pdf").click();
    await expect(page.getByTestId("files-preview-panel")).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.getByTestId("files-preview-delete").click();
    await expect(page.getByTestId("files-preview-panel")).toHaveCount(0);
    await expect(page.getByText("Product Brief.pdf")).toHaveCount(0);

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "after-delete-completed-mobile.png"),
      animations: "disabled",
    });
  });
});
