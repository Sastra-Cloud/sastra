import type { Page } from "@playwright/test";
import { expect, test, usefulWorkMeasures } from "./fixtures";

async function touch(page: Page, selector: string, type: string, y: number) {
  await page.locator(selector).first().evaluate((target, { type, y }) => {
    // Reproduce WebKit's non-cancelable move delivery. This exercises the
    // browser handler and real page layout, not physical iPhone scroll physics.
    const event = new Event(type, { bubbles: true, cancelable: false });
    Object.defineProperty(event, "touches", {
      value: type === "touchend" || type === "touchcancel" ? [] : [{ clientX: 180, clientY: y }],
    });
    target.dispatchEvent(event);
  }, { type, y });
}

// A page refresh must work without allowing a pull inside message history to
// reload and discard an unsent draft. Unit tests cannot check real page ancestry.
test("mobile refresh works on pages and chat headers while protecting message drafts", async ({ page, isMobile, fixtures }) => {
  test.skip(!isMobile, "Pull-to-refresh is a mobile interaction.");
  await page.goto("/dashboard");
  await expect.poll(async () => (await usefulWorkMeasures(page))["dashboard-tasks-ready"]).toBeGreaterThan(0);

  await touch(page, "h1", "touchstart", 100);
  await touch(page, "h1", "touchmove", 300);
  await expect(page.getByText("Release to refresh", { exact: true })).toBeVisible();
  // Releasing a deliberate pull performs a real document reload.
  await Promise.all([
    page.waitForEvent("load"),
    touch(page, "h1", "touchend", 300),
  ]);
  await expect(page.getByText("Release to refresh", { exact: true })).not.toBeVisible();

  await page.goto(`/chat/${fixtures.generalChannelId}`);
  const composer = page.locator("[data-chat-composer] textarea:visible");
  await expect(composer).toBeVisible();
  await expect.poll(async () => (await usefulWorkMeasures(page))["chat-composer-ready"]).toBeGreaterThan(0);
  await composer.fill("Keep this unsent draft");
  await touch(page, '[data-slot="message-scroller-viewport"]', "touchstart", 100);
  await touch(page, '[data-slot="message-scroller-viewport"]', "touchmove", 300);
  await expect(page.getByText("Release to refresh", { exact: true })).not.toBeVisible();
  await touch(page, '[data-slot="message-scroller-viewport"]', "touchend", 300);
  await expect(composer).toHaveValue("Keep this unsent draft");

  // Hold the route refresh so the pending state and retained draft are visible.
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/chat/${fixtures.generalChannelId}?_rsc=*`, async route => {
    await gate;
    await route.continue();
  });
  await page.evaluate(() => { document.documentElement.dataset.refreshDocument = "retained"; });
  const header = "[data-conversation-refresh] h1";
  await touch(page, header, "touchstart", 100);
  await touch(page, header, "touchmove", 300);
  await expect(page.getByText("Release to refresh", { exact: true })).toBeVisible();
  await touch(page, header, "touchend", 300);
  try {
    await expect(page.getByText("Refreshing…", { exact: true })).toBeVisible();
    await expect(composer).toHaveValue("Keep this unsent draft");
  } finally {
    release();
  }
  await expect(page.getByText("Refreshing…", { exact: true })).not.toBeVisible();
  await expect(composer).toHaveValue("Keep this unsent draft");
  await expect(page.locator("html")).toHaveAttribute("data-refresh-document", "retained");

  // The familiar gesture also works when a new pull starts at the true top.
  const transcript = '[data-slot="message-scroller-viewport"]';
  await page.locator(transcript).evaluate(element => { element.scrollTop = 0; });
  const refreshed = page.waitForResponse(response =>
    response.url().includes(`/chat/${fixtures.generalChannelId}?_rsc=`) && response.ok());
  await touch(page, transcript, "touchstart", 100);
  await touch(page, transcript, "touchmove", 300);
  await expect(page.getByText("Release to refresh", { exact: true })).toBeVisible();
  await touch(page, transcript, "touchend", 300);
  await refreshed;
  await expect(composer).toHaveValue("Keep this unsent draft");
  await expect(page.locator("html")).toHaveAttribute("data-refresh-document", "retained");
});
