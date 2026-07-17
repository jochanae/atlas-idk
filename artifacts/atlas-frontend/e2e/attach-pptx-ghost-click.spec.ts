import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

/**
 * PowerPoint / Documents-app path: selecting a .pptx must not wipe Ask Atlas.
 * Document pickers return later ghost taps than the photo gallery — cover the
 * longer shield + Exit refusal window.
 */
test.describe("Ask Atlas PowerPoint attach ghost-click", () => {
  test.use({
    viewport: { width: 280, height: 653 },
    isMobile: true,
    hasTouch: true,
  });

  test("pptx select stages attachment; delayed Exit ghost tap does not clear surface", async ({
    page,
  }) => {
    const pptxPath = path.join("/tmp", "atlas-e2e-deck.pptx");
    // Minimal ZIP-shaped bytes so MIME/extension look like a real deck.
    fs.writeFileSync(pptxPath, Buffer.from("PK\u0003\u0004fake-pptx-for-e2e"));

    await page.addInitScript(() => {
      localStorage.setItem("atlas-auth-token", "e2e-token");
      localStorage.setItem("atlas-attach-audit", "1");
      localStorage.setItem("atlas-ask-atlas-conversation-id", "conv-e2e-pptx");
      sessionStorage.setItem("atlas-ask-atlas-conversation-id", "conv-e2e-pptx");
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
            { role: "user", content: "Keep this thread for the deck." },
            { role: "assistant", content: "Ready for the PowerPoint." },
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

    await page.setInputFiles("#ask-atlas-attach-input", {
      name: "pitch.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: fs.readFileSync(pptxPath),
    });

    // Home + Ask Atlas composers can both render the chip; shield may cover them.
    await expect
      .poll(async () => page.locator('[aria-label="Remove attachment"]').count())
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(async () => page.getByText("PPTX", { exact: true }).count())
      .toBeGreaterThanOrEqual(1);
    await expect(page.locator("[data-atlas-ghost-shield]")).toHaveCount(1);

    const exit = page.locator('button[aria-label="Exit Ask Atlas"]');
    const box = await exit.boundingBox();
    expect(box).toBeTruthy();

    // Simulate the delayed Documents-app ghost tap (~1s after select).
    await page.waitForTimeout(900);
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await expect(page.locator(".atlas-ask-atlas-scroll")).toBeVisible();
    await expect(page.locator("[data-msg-idx]")).toHaveCount(2);
    await expect
      .poll(async () => page.locator('[aria-label="Remove attachment"]').count())
      .toBeGreaterThanOrEqual(1);

    // After the document shield window, intentional Exit still works.
    await page.waitForTimeout(1500);
    await expect(page.locator("[data-atlas-ghost-shield]")).toHaveCount(0);
    await expect(
      page.locator('[aria-label="Remove attachment"]').filter({ visible: true }).first(),
    ).toBeVisible();
    await exit.click();
    await expect(page.locator(".atlas-ask-atlas-scroll")).toHaveCount(0);
  });
});
