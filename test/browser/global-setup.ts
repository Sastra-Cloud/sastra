import { request } from "@playwright/test";
import { join } from "node:path";

/** Signs in through the real Better Auth endpoint and keeps the cookie in the run's temp directory only. */
export default async function globalSetup() {
  const baseURL = process.env.SASTRA_BROWSER_BASE_URL;
  const email = process.env.SASTRA_BROWSER_EMAIL;
  const password = process.env.SASTRA_BROWSER_PASSWORD;
  const state = process.env.SASTRA_BROWSER_STATE;
  if (!baseURL || !email || !password || !state) {
    throw new Error("Run the browser tests with `pnpm test:browser`; it provisions the fixture.");
  }
  const context = await request.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { origin: baseURL } });
  const response = await context.post("/api/auth/sign-in/email", { data: { email, password } });
  if (!response.ok()) throw new Error(`Fixture sign-in failed (HTTP ${response.status()}).`);
  await context.storageState({ path: join(state, "auth.json") });
  await context.dispose();
}
