import { expect, test } from "@playwright/test";

const PROJECT_ID = 42;
const SESSION_ID = 9001;
const PROJECT_NAME = "SanctumIQ Pitch Deck";

test.describe("mobile workspace → Ask Atlas context handoff", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("opens a project, taps the purple Conversation dot, and sends project seed", async ({ page }) => {
    let nexusBody: Record<string, unknown> | null = null;

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();

      if (url.pathname === "/api/auth/me") {
        return route.fulfill({ json: { id: 1, email: "test@example.com", name: "Test", avatarUrl: null, role: "user", subscriptionTier: "pro", googleLinked: false, hasPassword: true } });
      }

      if (url.pathname === "/api/nexus/chat" && method === "POST") {
        nexusBody = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          headers: { "content-type": "text/event-stream" },
          body: "event: token\ndata: {\"text\":\"Seed received\"}\n\nevent: done\ndata: {\"conversationId\":\"ask-e2e\"}\n\n",
        });
      }

      if (url.pathname === "/api/projects") {
        return route.fulfill({ json: [{ id: PROJECT_ID, name: PROJECT_NAME, status: "committed", updatedAt: "2026-07-07T12:00:00.000Z" }] });
      }

      if (url.pathname === `/api/projects/${PROJECT_ID}/state`) {
        return route.fulfill({
          json: {
            project: {
              id: PROJECT_ID,
              name: PROJECT_NAME,
              status: "committed",
              updatedAt: "2026-07-07T12:00:00.000Z",
              memory: JSON.stringify({ entries: [{ tier: 1, text: "Project brief from home conversation: pitch-deck strategy for church fundraising" }] }),
            },
            activeSession: { id: SESSION_ID, projectId: PROJECT_ID, title: "Main", createdAt: "2026-07-07T12:00:00.000Z", updatedAt: "2026-07-07T12:00:00.000Z" },
            decisions: [{ id: 7, projectId: PROJECT_ID, status: "draft", title: "Choose donor proof points", severity: "neutral", mode: "decision", isViolation: false, deviation: false, createdAt: "2026-07-07T12:00:00.000Z", updatedAt: "2026-07-07T12:00:00.000Z" }],
            parked: [],
            parkedCount: 0,
            forgeState: null,
            memorySummary: "pitch-deck strategy for church fundraising",
            recentContext: null,
          },
        });
      }

      if (url.pathname === `/api/projects/${PROJECT_ID}/runs`) {
        return route.fulfill({ json: [{ id: "run-1", title: "Updated mobile navigation", runStatus: "applied", createdAt: "2026-07-07T12:02:00.000Z" }] });
      }

      if (url.pathname === `/api/projects/${PROJECT_ID}/intelligence`) {
        return route.fulfill({ json: { readiness: { overall: 57, overallLabel: "Shaping" } } });
      }

      if (url.pathname === `/api/projects/${PROJECT_ID}/readiness`) {
        return route.fulfill({ json: { overall: 57, overallLabel: "Shaping", dimensions: [] } });
      }

      if (url.pathname.includes(`/api/projects/${PROJECT_ID}/`)) {
        return route.fulfill({ json: url.pathname.endsWith("/greeting") ? { message: "Here. What are you seeing?" } : [] });
      }

      return route.fulfill({ json: [] });
    });

    await page.addInitScript(() => localStorage.setItem("atlas-auth-token", "e2e-token"));
    await page.goto(`/project/${PROJECT_ID}`);

    await expect(page.getByText(PROJECT_NAME)).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/home$/),
      page.getByRole("button", { name: "Open Ask Atlas conversation" }).click({ force: true }),
    ]);

    await page.getByRole("textbox").last().fill("Continue from the project context.");
    await page.getByRole("button", { name: /send/i }).last().tap();

    await expect.poll(() => nexusBody).not.toBeNull();
    expect(nexusBody).toMatchObject({ projectId: PROJECT_ID, sessionId: SESSION_ID });
    expect(String(nexusBody?.askAtlasContextSeed)).toContain(PROJECT_NAME);
    expect(String(nexusBody?.askAtlasContextSeed)).toContain("Updated mobile navigation");
    expect(String(nexusBody?.askAtlasContextSeed)).toContain("Choose donor proof points");
  });
});