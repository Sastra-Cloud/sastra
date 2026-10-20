import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { savePartnerQuote } from "./partner-quote-save";

const fetchMock = vi.fn<typeof fetch>();
const input = {
  printRunId: null, mode: "itemized" as const, deductionPercent: 13,
  publicDescription: "Audio Book Production", perCopyQuantity: null, perCopyUnitPrice: null,
};
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

it("saves through a stable URL and reconciles with server-normalized quotation settings", async () => {
  const presentation = { mode: "itemized", deductionBps: 1300, publicDescription: "Audio Book Production", perCopyQuantity: null, perCopyUnitPrice: null };
  fetchMock.mockResolvedValue(Response.json({ ok: true, presentation }));
  expect(await savePartnerQuote("example-book", input)).toEqual(presentation);
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/projects/example-book/budget/partner-quote");
  expect(request).toMatchObject({ method: "PUT", credentials: "same-origin" });
  expect(new Headers(request!.headers).has("Next-Action")).toBe(false);
  expect(JSON.parse(request!.body as string)).toEqual(input);
});

it("keeps a failed save recoverable without retrying a possibly completed request", async () => {
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
  await expect(savePartnerQuote("example-book", input)).rejects.toThrow("Your edits are still here");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("does not report success for an expired session or a non-JSON server error", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ error: "Sign in again before saving the partner quote." }, { status: 401 }));
  await expect(savePartnerQuote("example-book", input)).rejects.toThrow("Sign in again");
  fetchMock.mockResolvedValueOnce(new Response("Service unavailable", { status: 503 }));
  await expect(savePartnerQuote("example-book", input)).rejects.toThrow("Could not save");
});
