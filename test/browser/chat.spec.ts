import { randomUUID } from "node:crypto";
import type { Page, Request } from "@playwright/test";

import { expect, expectNoHorizontalOverflow, test, usefulWorkMeasures } from "./fixtures";

/** Pixels between the end of the transcript and the bottom of its scroller. */
async function distanceFromLatest(page: Page) {
  return page.evaluate(() => {
    const thread = document.querySelector("[data-chat-thread]");
    if (!thread) return Number.NaN;
    const scroller = [...thread.querySelectorAll<HTMLElement>("*")].find((element) => {
      const { overflowY } = getComputedStyle(element);
      return /(auto|scroll)/.test(overflowY) && element.scrollHeight > element.clientHeight;
    });
    return scroller ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight : Number.NaN;
  });
}

async function openGeneral(page: Page, channelId: string) {
  await page.goto(`/chat/${channelId}`);
  const composer = page.locator("[data-chat-composer] textarea:visible");
  await expect(composer).toBeVisible();
  // Server-rendered HTML is visible before it responds. Wait for hydration, or
  // a fast click or fill can land on a composer that is not yet wired up.
  await expect.poll(async () => (await usefulWorkMeasures(page))["chat-composer-ready"]).toBeGreaterThan(0);
  return composer;
}

/**
 * The server action that sends this exact message: a POST whose body carries
 * the test's unique text. Matching by body works in every browser; matching on
 * the `next-action` header does not, because WebKit hides it from interception.
 */
function isSendOf(request: Request, text: string) {
  return request.method() === "POST" && (request.postData() ?? "").includes(text);
}

test.describe("chat conversation", () => {
  // Protects the reported regression: a reopened chat landing mid-history or
  // drifting off the newest message after the keyboard or toolbar resized the page.
  test("a reopened conversation shows the newest message and keeps it through layout changes", async ({ page, fixtures }) => {
    await openGeneral(page, fixtures.generalChannelId);
    await expect.poll(() => distanceFromLatest(page)).toBeLessThan(8);

    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.width, height: Math.round(size.height * 0.6) });
    await expect.poll(() => distanceFromLatest(page)).toBeLessThan(8);
    await page.setViewportSize(size);
    await expect.poll(() => distanceFromLatest(page)).toBeLessThan(8);

    // Reopen by leaving and coming back through history.
    await page.goto("/dashboard");
    await page.goBack();
    await expect(page.locator("[data-chat-composer] textarea:visible")).toBeVisible();
    await expect.poll(() => distanceFromLatest(page)).toBeLessThan(8);
    await expectNoHorizontalOverflow(page);
  });

  test("the composer stays reachable and typeable in a short window", async ({ page, fixtures }) => {
    const composer = await openGeneral(page, fixtures.generalChannelId);
    await expect(composer).toBeInViewport({ ratio: 0.9 });
    await composer.fill("Typing in a short window");
    await expect(composer).toHaveValue("Typing in a short window");
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByRole("button", { name: "Send" })).toBeInViewport({ ratio: 0.9 });
  });

  test("sending shows the message at once, then keeps exactly one canonical copy", async ({ page, fixtures }) => {
    const composer = await openGeneral(page, fixtures.generalChannelId);
    const text = `Optimistic check ${randomUUID().slice(0, 8)}`;

    // Hold the server so the pending state can be observed.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/*", async (route) => {
      if (isSendOf(route.request(), text)) await gate;
      await route.continue();
    });

    await composer.fill(text);
    await page.getByRole("button", { name: "Send" }).click();
    const pending = page.locator('[data-message-id^="pending-"]').filter({ hasText: text });
    await expect(pending).toHaveCount(1);
    await expect(composer).toHaveValue("");

    release();
    const saved = page.locator('[data-message-id]:not([data-message-id^="pending-"])').filter({ hasText: text });
    await expect(saved).toHaveCount(1);
    await expect(pending).toHaveCount(0);

    await page.unroute("**/*");
    await page.reload();
    await expect(page.locator("[data-message-id]").filter({ hasText: text })).toHaveCount(1);
  });

  // Protects user work: a failed send must give the draft back, not lose it.
  test("a failed send removes the pending message and restores the draft", async ({ page, fixtures }) => {
    const composer = await openGeneral(page, fixtures.generalChannelId);
    const text = `Failure check ${randomUUID().slice(0, 8)}`;
    // The server answers this send with an error. One handler with a switch,
    // so recovery needs no unrouting mid-test.
    let serverDown = true;
    await page.route("**/*", (route) =>
      serverDown && isSendOf(route.request(), text)
        ? route.fulfill({ status: 500, contentType: "text/plain", body: "unavailable" })
        : route.continue()
    );

    await composer.fill(text);
    await page.getByRole("button", { name: "Send" }).click();

    // The person is told (the toast is transient, so check the lasting note), and nothing they typed is lost.
    await expect(page.getByText("Your draft is restored.", { exact: false })).toBeAttached();
    await expect(composer).toHaveValue(text);
    await expect(page.locator("[data-message-id]").filter({ hasText: text })).toHaveCount(0);

    // Recovery works: once the server is back the same draft sends.
    serverDown = false;
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator('[data-message-id]:not([data-message-id^="pending-"])').filter({ hasText: text })).toHaveCount(1);
  });

  test("records when the composer is usable, and when messages are visible where the browser can tell", async ({ page, fixtures, browserName }) => {
    await openGeneral(page, fixtures.generalChannelId);
    await expect.poll(async () => (await usefulWorkMeasures(page))["chat-composer-ready"]).toBeGreaterThan(0);
    // Element Timing is a Chromium feature; elsewhere the marker is simply absent.
    if (browserName === "chromium") {
      await expect.poll(async () => (await usefulWorkMeasures(page))["chat-messages-visible"]).toBeGreaterThan(0);
    }
  });
});
