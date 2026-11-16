import { describe, expect, it } from "vitest";

import { observationForWebVital, parsePerformanceReport, routeCategoryForPath } from "./performance-report";

const valid = {
  version: 1,
  observations: [
    { name: "LCP", route: "dashboard", navigation: "hard", value: 1234.5 },
    { name: "CLS", route: "chat", navigation: "client", value: 0.07 },
    { name: "chat-composer-ready", route: "chat", navigation: "client", value: 420 },
  ],
};

describe("performance report parsing", () => {
  it("attributes delayed vitals to their measured navigation and removes its private URL", () => {
    const delayed = observationForWebVital({
      name: "INP", value: 123, navigationType: "soft-navigation",
      navigationURL: "https://app.test/chat/private-channel?token=private#message",
    }, "dashboard");
    expect(delayed).toEqual({ name: "INP", value: 123, route: "chat", navigation: "client" });
    expect(observationForWebVital({ name: "LCP", value: 800, navigationType: "navigate" }, "project"))
      .toEqual({ name: "LCP", value: 800, route: "project", navigation: "hard" });
    expect(observationForWebVital({ name: "LCP", value: 800, navigationType: "soft-navigation" }, "project"))
      .toBeNull();
  });
  // Protects the privacy promise: only validated numbers survive intact.
  it("keeps valid numeric observations exactly as sent", () => {
    expect(parsePerformanceReport(valid)).toEqual(valid);
  });

  it("rejects anything that could carry identity or free text", () => {
    const withField = (extra: Record<string, unknown>) => ({
      ...valid,
      observations: [{ ...valid.observations[0], ...extra }],
    });
    for (const input of [
      withField({ url: "/projects/secret-book" }),
      withField({ name: "/projects/secret-book" }),
      withField({ route: "/chat/6b1d" }),
      { ...valid, userId: "u1" },
      { ...valid, observations: [{ name: "LCP", route: "dashboard", navigation: "hard", value: "12" }] },
      { ...valid, observations: [{ name: "LCP", route: "dashboard", navigation: "hard", value: { entries: [] } }] },
    ]) {
      expect(parsePerformanceReport(input)).toBeNull();
    }
  });

  it("rejects out-of-range numbers, wrong versions, and oversized batches", () => {
    const one = (value: number) => ({
      version: 1,
      observations: [{ name: "INP", route: "other", navigation: "hard", value }],
    });
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, 700_000]) {
      expect(parsePerformanceReport(one(value))).toBeNull();
    }
    expect(parsePerformanceReport({ ...valid, version: 2 })).toBeNull();
    expect(parsePerformanceReport({ version: 1, observations: [] })).toBeNull();
    expect(
      parsePerformanceReport({
        version: 1,
        observations: Array.from({ length: 13 }, () => valid.observations[0]),
      })
    ).toBeNull();
    expect(parsePerformanceReport(null)).toBeNull();
    expect(parsePerformanceReport("LCP")).toBeNull();
  });

  it("refuses a useful-work marker claimed for the wrong kind of page", () => {
    expect(
      parsePerformanceReport({
        version: 1,
        observations: [{ name: "chat-composer-ready", route: "dashboard", navigation: "hard", value: 5 }],
      })
    ).toBeNull();
  });

  it("reduces a path to a fixed category without keeping it", () => {
    expect(routeCategoryForPath("/dashboard")).toBe("dashboard");
    expect(routeCategoryForPath("/projects")).toBe("projects");
    expect(routeCategoryForPath("/projects/some-book/tasks")).toBe("project");
    expect(routeCategoryForPath("/projects/some-book/chat")).toBe("chat");
    expect(routeCategoryForPath("/chat/abc?x=1#y")).toBe("chat");
    expect(routeCategoryForPath("/settings/team")).toBe("other");
  });
});
