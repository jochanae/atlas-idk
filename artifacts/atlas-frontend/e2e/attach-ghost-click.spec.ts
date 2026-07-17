import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

/**
 * Z Fold / mobile: selecting a file must not wipe the Ask Atlas surface.
 * Root cause was a post-picker ghost tap landing on "Exit Ask Atlas".
 */
test.describe("Ask Atlas attach ghost-click", () => {
  test.use({
    viewport: { width: 280, height: 653 },
    isMobile: true,
    hasTouch: true,
  });

  test("file select stages attachment; ghost tap on Exit does not clear surface", async ({
    page,
  }) => {
    const pngPath = path.join("/tmp", "atlas-e2e-attach.png");
    fs.writeFileSync(
      pngPath,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    );

    await page.addInitScript(() => {
      localStorage.setItem("atlas-auth-token", "e2e-token");
      localStorage.setItem("atlas-attach-audit", "1");
      localStorage.setItem("atlas-ask-atlas-conversation-id", "conv-e2e-attach");
      sessionStorage.setItem("atlas-ask-atlas-conversation-id", "conv-e2e-attach");
      localStorage.setItem("atlas-ask-atlas-surface-open", "1");
      sessionStorage.removeItem("atlas-ask-atlas-closed");
    });

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const p = url.pathname;
      if (p === "/api/auth/me") {
        return route.fulfill({
          json: {
            id: 1,
            email: "e2e@test.local",
            name: "E2E",
            avatarUrl: null,
            role: "user",
            subscriptionTier: "pro",
            googleLinked: false,
            hasPassword: true,
          },
        });
      }
      if (p === "/api/capabilities") {
        return route.fulfill({ json: { attachmentPersistence: true } });
      }
      if (p === "/api/projects") return route.fulfill({ json: [] });
      if (p === "/api/nexus/thread") {
        return route.fulfill({
          json: [
            { role: "user", content: "Keep this thread." },
            { role: "assistant", content: "Ready for attachments." },
          ],
        });
      }
      if (p.includes("/api/entries")) return route.fulfill({ json: { count: 0, entries: [] } });
      if (p.includes("/api/nexus/")) return route.fulfill({ json: {} });
      if (p.includes("/api/conversations")) return route.fulfill({ json: [] });
      return route.fulfill({ json: {} });
    });

    await page.goto("/home?attachAudit=1");
    await expect(page.locator(".atlas-ask-atlas-scroll")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-msg-idx]")).toHaveCount(2);

    await page.setInputFiles("#ask-atlas-attach-input", pngPath);

    // Home + Ask Atlas composers can both render the chip; shield may cover them.
    await expect
      .poll(async () => page.locator('[aria-label="Remove attachment"]').count())
      .toBeGreaterThanOrEqual(1);
    await expect(page.locator("[data-atlas-ghost-shield]")).toHaveCount(1);

    const exit = page.locator('button[aria-label="Exit Ask Atlas"]');
    const box = await exit.boundingBox();
    expect(box).toBeTruthy();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);

    // Surface + thread must survive the ghost tap.
    await expect(page.locator(".atlas-ask-atlas-scroll")).toBeVisible();
    await expect(page.locator("[data-msg-idx]")).toHaveCount(2);
    await expect
      .poll(async () => page.locator('[aria-label="Remove attachment"]').count())
      .toBeGreaterThanOrEqual(1);

    // Intentional exit still works after the shield expires.
    await page.waitForTimeout(500);
    await expect(page.locator("[data-atlas-ghost-shield]")).toHaveCount(0);
    // Prefer the visible Ask Atlas chip (home composer may keep a covered duplicate).
    await expect(
      page.locator('[aria-label="Remove attachment"]').filter({ visible: true }).first(),
    ).toBeVisible();
    await exit.click();
    await expect(page.locator(".atlas-ask-atlas-scroll")).toHaveCount(0);
  });
});
