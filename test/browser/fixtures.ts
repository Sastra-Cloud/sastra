import { test as base, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Fixtures = {
  projectSlug: string;
  generalChannelId: string;
  projectChannelId: string;
};

function loadFixtures(): Fixtures {
  const state = process.env.SASTRA_BROWSER_STATE;
  if (!state) throw new Error("Run the browser tests with `pnpm test:browser`.");
  return JSON.parse(readFileSync(join(state, "fixtures.json"), "utf8")) as Fixtures;
}

export const test = base.extend<{ fixtures: Fixtures }>({
  fixtures: async ({}, provide) => {
    await provide(loadFixtures());
  },
});
export { expect };

/** The page must never scroll sideways. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Time-ordered `sastra:*` User Timing measures written by the app, in milliseconds. */
export async function usefulWorkMeasures(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      performance
        .getEntriesByType("measure")
        .filter((entry) => entry.name.startsWith("sastra:"))
        .map((entry) => [entry.name.slice("sastra:".length), entry.duration])
    )
  );
}
