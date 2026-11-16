import { expect, expectNoHorizontalOverflow, test, usefulWorkMeasures } from "./fixtures";

test.describe("navigation", () => {
  // Protects RouteScrollManager: a normal link starts at the top of the new
  // screen, and Back returns to where the person was reading.
  test("a link starts at the top and Back restores the previous position", async ({ page, fixtures }) => {
    await page.goto("/dashboard");
    const link = page.locator(`main a[href="/projects/${fixtures.projectSlug}"]`).first();
    await expect(link).toBeVisible();
    await link.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(100);

    await link.click();
    await expect(page).toHaveURL(new RegExp(`/projects/${fixtures.projectSlug}$`));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard$/);
    // What matters to the reader: the place they left is on screen again.
    await expect(page.locator(`main a[href="/projects/${fixtures.projectSlug}"]`).first()).toBeInViewport();
    await expect
      .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - before))
      .toBeLessThan(60);
  });

  test("core pages never scroll sideways", async ({ page, fixtures }) => {
    for (const path of [
      "/dashboard",
      "/projects",
      `/projects/${fixtures.projectSlug}`,
      `/chat/${fixtures.generalChannelId}`,
    ]) {
      await page.goto(path);
      if (path.startsWith("/chat/")) {
        // Check the settled conversation layout, after its fixed mobile frame
        // removes itself from normal flow and the app hides the top bar.
        await expect.poll(async () => (await usefulWorkMeasures(page))["chat-composer-ready"]).toBeGreaterThan(0);
      }
      await expect(page.locator("main").first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });
});
