import { expect, expectNoHorizontalOverflow, test, usefulWorkMeasures } from "./fixtures";

test.describe("home", () => {
  // Protects the point of streaming Home: tasks must be there and usable
  // without waiting on the setup checklist or the manager review list.
  test("tasks are visible and open for editing", async ({ page }) => {
    await page.goto("/dashboard");
    const task = page.getByText("Browser test task", { exact: false }).first();
    await expect(task).toBeVisible();
    await expect.poll(async () => (await usefulWorkMeasures(page))["dashboard-tasks-ready"]).toBeGreaterThan(0);
    await task.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("distinguishes visible content from ready-to-use content in Chromium", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Element Timing is a Chromium feature.");
    await page.goto("/dashboard");
    await expect.poll(async () => (await usefulWorkMeasures(page))["dashboard-tasks-visible"]).toBeGreaterThan(0);
    const measures = await usefulWorkMeasures(page);
    expect(measures["dashboard-tasks-ready"]).toBeGreaterThan(0);
  });

  // Protects primary work from auxiliary failure: badge counts are a
  // convenience and must never block, hide, or reset the page.
  test("a slow, then failing, badge feed leaves tasks usable", async ({ page }) => {
    let started = 0;
    let failed = 0;
    await page.route("**/api/navigation/badges", async (route) => {
      started += 1;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      failed += 1;
      await route.fulfill({ status: 500, body: "unavailable" });
    });
    await page.goto("/dashboard");
    const task = page.getByText("Browser test task", { exact: false }).first();
    await expect(task).toBeVisible();

    // Window focus asks the feed for fresh counts. The shell's listener attaches
    // once the streamed counts arrive, so retry. Wait out each attempt: a new
    // focus cancels the request still in flight.
    for (let attempt = 0; attempt < 8 && started === 0; attempt++) {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect.poll(() => started, { timeout: 2500 }).toBeGreaterThan(0).catch(() => {});
    }
    expect(started).toBeGreaterThan(0);

    // Work while the request is slow.
    await task.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // After it fails the page is unchanged: same tasks, no error page.
    await expect.poll(() => failed).toBeGreaterThan(0);
    await expect(task).toBeVisible();
    await expect(page.locator("h1")).toHaveText("Home");
  });

  test("an in-app route change records its own measure", async ({ page, fixtures }) => {
    await page.goto(`/projects/${fixtures.projectSlug}`);
    const chat = page.locator(`a[href="/projects/${fixtures.projectSlug}/chat"]`).first();
    await chat.click();
    await expect(page.locator("[data-chat-composer] textarea:visible")).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const entry = performance.getEntriesByName("sastra:chat-composer-ready")[0] as
            | (PerformanceMeasure & { detail?: { navigation?: string; route?: string } })
            | undefined;
          return entry ? `${entry.detail?.navigation}:${entry.detail?.route}` : null;
        })
      )
      .toBe("client:chat");
  });
});
