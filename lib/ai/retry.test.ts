import { describe, expect, it, vi } from "vitest";

import {
  AiTimeoutError,
  callWithRetry,
  isRetryableAiError,
  withTimeout,
} from "./retry";

const noSleep = () => Promise.resolve();
const noJitter = () => 0;

describe("isRetryableAiError", () => {
  it("retries 429 and 5xx", () => {
    expect(isRetryableAiError({ status: 429 })).toBe(true);
    expect(isRetryableAiError({ status: 500 })).toBe(true);
    expect(isRetryableAiError({ status: 503 })).toBe(true);
    expect(isRetryableAiError({ statusCode: 502 })).toBe(true);
    expect(isRetryableAiError({ response: { status: 500 } })).toBe(true);
  });

  it("does not retry other 4xx", () => {
    expect(isRetryableAiError({ status: 400 })).toBe(false);
    expect(isRetryableAiError({ status: 401 })).toBe(false);
    expect(isRetryableAiError({ status: 404 })).toBe(false);
    expect(isRetryableAiError({ status: 422 })).toBe(false);
  });

  it("retries our timeout and connection errors", () => {
    expect(isRetryableAiError(new AiTimeoutError("x", 10))).toBe(true);
    expect(isRetryableAiError({ name: "APIConnectionError" })).toBe(true);
    expect(isRetryableAiError({ code: "ECONNRESET" })).toBe(true);
    expect(isRetryableAiError({ code: "ETIMEDOUT" })).toBe(true);
    const fetchErr = new TypeError("fetch failed");
    expect(isRetryableAiError(fetchErr)).toBe(true);
  });

  it("does not retry arbitrary errors", () => {
    expect(isRetryableAiError(new Error("boom"))).toBe(false);
    expect(isRetryableAiError(null)).toBe(false);
    expect(isRetryableAiError("nope")).toBe(false);
  });
});

describe("withTimeout", () => {
  it("resolves when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, "x")).resolves.toBe(42);
  });

  it("rejects with AiTimeoutError when it does not", async () => {
    const never = new Promise<number>(() => {});
    await expect(withTimeout(never, 5, "slow op")).rejects.toBeInstanceOf(
      AiTimeoutError
    );
  });
});

describe("callWithRetry", () => {
  it("returns the first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const out = await callWithRetry("t", fn, { sleep: noSleep, jitter: noJitter });
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable error then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce("recovered");
    const out = await callWithRetry("t", fn, {
      retries: 1,
      sleep: noSleep,
      jitter: noJitter,
    });
    expect(out).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable error", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400 });
    await expect(
      callWithRetry("t", fn, { retries: 3, sleep: noSleep, jitter: noJitter })
    ).rejects.toMatchObject({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries and rethrows the last error", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 500 });
    await expect(
      callWithRetry("t", fn, { retries: 2, sleep: noSleep, jitter: noJitter })
    ).rejects.toMatchObject({ status: 500 });
    expect(fn).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("fires the per-attempt timeout as a retryable error", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(() => {
      calls++;
      // First attempt hangs (times out), second resolves fast.
      return calls === 1
        ? new Promise<string>(() => {})
        : Promise.resolve("second");
    });
    const out = await callWithRetry("t", fn, {
      timeoutMs: 10,
      retries: 1,
      sleep: noSleep,
      jitter: noJitter,
    });
    expect(out).toBe("second");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("aborts a timed-out attempt before retrying", async () => {
    const aborted: boolean[] = [];
    let calls = 0;
    const out = await callWithRetry(
      "t",
      (signal) => {
        calls++;
        if (calls === 2) return Promise.resolve("second");
        return new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted.push(signal.aborted);
            reject(signal.reason);
          });
        });
      },
      { timeoutMs: 10, retries: 1, sleep: noSleep, jitter: noJitter }
    );
    expect(out).toBe("second");
    expect(aborted).toEqual([true]);
  });
});
