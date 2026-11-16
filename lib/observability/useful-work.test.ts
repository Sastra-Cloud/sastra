import { describe, expect, it } from "vitest";

import { createReportBuffer } from "./performance-buffer";
import { parsePerformanceReport, type PerformanceObservation } from "./performance-report";
import { createUsefulWorkTracker } from "./useful-work";

function setup() {
  let time = 0;
  const tracker = createUsefulWorkTracker(() => time);
  const seen: PerformanceObservation[] = [];
  tracker.subscribe((observation) => seen.push(observation));
  return { tracker, seen, at: (value: number) => { time = value; } };
}

describe("useful-work tracking", () => {
  it("measures a document load from the browser's time origin", () => {
    const { tracker, seen, at } = setup();
    tracker.begin("/dashboard", "hard");
    at(900);
    tracker.report("dashboard-tasks-ready");
    tracker.report("dashboard-tasks-visible", { at: 610 });
    expect(seen).toEqual([
      { name: "dashboard-tasks-ready", route: "dashboard", navigation: "hard", value: 900 },
      { name: "dashboard-tasks-visible", route: "dashboard", navigation: "hard", value: 610 },
    ]);
  });

  it("measures an in-app navigation from the moment it started", () => {
    const { tracker, seen, at } = setup();
    tracker.begin("/dashboard", "hard");
    at(5000);
    tracker.begin("/projects/some-book/chat", "client");
    at(5350);
    tracker.report("chat-composer-ready");
    expect(seen).toEqual([
      { name: "chat-composer-ready", route: "chat", navigation: "client", value: 350 },
    ]);
  });

  // Protects against crediting a slow page to the route that replaced it.
  it("drops work from a navigation that was replaced or is on another route", () => {
    const { tracker, seen, at } = setup();
    tracker.begin("/dashboard", "hard");
    const stale = tracker.current()!.epoch;
    at(100);
    tracker.begin("/chat/abc", "client");
    at(200);
    expect(tracker.report("dashboard-tasks-ready", { epoch: stale })).toBe(false);
    expect(tracker.report("dashboard-tasks-ready")).toBe(false); // wrong route now
    expect(seen).toEqual([]);
  });

  it("records each marker once per navigation and again after the next one", () => {
    const { tracker, seen, at } = setup();
    tracker.begin("/chat", "hard");
    at(10);
    expect(tracker.report("chat-composer-ready")).toBe(true);
    expect(tracker.report("chat-composer-ready")).toBe(false);
    at(20);
    tracker.begin("/chat/other", "client");
    at(25);
    expect(tracker.report("chat-composer-ready")).toBe(true);
    expect(seen.map((item) => item.value)).toEqual([10, 5]);
  });

  it("does nothing before a navigation is known", () => {
    const { tracker, seen } = setup();
    expect(tracker.report("dashboard-tasks-ready")).toBe(false);
    expect(seen).toEqual([]);
  });

  it("replays readiness to a late reporter without replaying the previous navigation", () => {
    const { tracker, at } = setup();
    tracker.begin("/dashboard", "hard");
    at(300);
    tracker.report("dashboard-tasks-ready");
    const reports: PerformanceObservation[] = [];
    const unsubscribe = tracker.subscribe((value) => reports.push(value), { replay: true });
    expect(reports).toEqual([
      { name: "dashboard-tasks-ready", route: "dashboard", navigation: "hard", value: 300 },
    ]);
    unsubscribe();
    tracker.begin("/chat/private-channel", "client");
    const next: PerformanceObservation[] = [];
    tracker.subscribe((value) => next.push(value), { replay: true });
    expect(next).toEqual([]);
    at(500);
    tracker.report("chat-composer-ready");
    expect(next.map((value) => value.name)).toEqual(["chat-composer-ready"]);
    expect(reports).toHaveLength(1);
  });
});

describe("report buffer", () => {
  const observation = (value: number): PerformanceObservation => ({
    name: "LCP", route: "other", navigation: "hard", value,
  });

  it("bounds the queue and sends only validated, size-limited reports", () => {
    const sent: string[] = [];
    const buffer = createReportBuffer((body) => sent.push(body));
    for (let i = 0; i < 40; i++) buffer.add(observation(i));
    expect(buffer.size()).toBe(24);
    buffer.flush();
    expect(sent).toHaveLength(2);
    for (const body of sent) {
      expect(body.length).toBeLessThanOrEqual(2048);
      expect(parsePerformanceReport(JSON.parse(body))).not.toBeNull();
    }
    expect(buffer.size()).toBe(0);
  });

  it("drops invalid values instead of sending them", () => {
    const sent: string[] = [];
    const buffer = createReportBuffer((body) => sent.push(body));
    buffer.add(observation(-5));
    buffer.flush();
    expect(sent).toEqual([]);
  });

  it("stops sending after a page's report budget", () => {
    const sent: string[] = [];
    const buffer = createReportBuffer((body) => sent.push(body));
    for (let round = 0; round < 10; round++) {
      buffer.add(observation(round));
      buffer.flush();
    }
    expect(sent).toHaveLength(6);
  });
});
