import { expect, test, usefulWorkMeasures } from "./fixtures";

const NAMES = new Set(["TTFB", "FCP", "LCP", "INP", "CLS",
  "dashboard-tasks-visible", "dashboard-tasks-ready", "chat-messages-visible", "chat-composer-ready"]);
const ROUTES = new Set(["dashboard", "projects", "project", "chat", "other"]);

test.describe("performance reporting", () => {
  // Protects the privacy promise end to end, in a real browser: what leaves
  // the page is numbers from fixed lists, and nothing that names a page, a
  // person, or a record.
  test("sends only allowlisted numbers, never identifiers", async ({ page, fixtures }) => {
    const bodies: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/observability/performance")) bodies.push(request.postData() ?? "");
    });
    await page.goto(`/chat/${fixtures.generalChannelId}`);
    await expect(page.locator("[data-chat-composer] textarea:visible")).toBeVisible();
    await expect.poll(async () => (await usefulWorkMeasures(page))["chat-composer-ready"]).toBeGreaterThan(0);
    // Flush on the same document so the assertion does not depend on CDP
    // retaining request events from a document it has already replaced.
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await expect.poll(() => bodies.length).toBeGreaterThan(0);
    // Child hydration can precede the reporter's mount. Initial readiness
    // must still reach the optional field reporter, not just local measures.
    await expect.poll(() => bodies.flatMap((body) =>
      JSON.parse(body).observations.map((item: { name: string }) => item.name)
    )).toContain("chat-composer-ready");

    for (const body of bodies) {
      expect(body).not.toContain(fixtures.projectSlug);
      expect(body).not.toContain(fixtures.generalChannelId);
      expect(body).not.toContain("@");
      const report = JSON.parse(body) as { version: number; observations: Record<string, unknown>[] };
      expect(Object.keys(report).sort()).toEqual(["observations", "version"]);
      expect(report.observations.length).toBeLessThanOrEqual(12);
      for (const observation of report.observations) {
        expect(Object.keys(observation).sort()).toEqual(["name", "navigation", "route", "value"]);
        expect(NAMES.has(observation.name as string)).toBe(true);
        expect(ROUTES.has(observation.route as string)).toBe(true);
        expect(["hard", "client"]).toContain(observation.navigation);
        expect(Number.isFinite(observation.value)).toBe(true);
        expect(observation.value as number).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
