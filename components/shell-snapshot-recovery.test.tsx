// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { GuidanceProvider, useGuidedElement, type GuidanceSnapshot } from "./guidance/guidance-provider";
import { NavigationBadgesProvider, useNavigationBadges } from "./navigation-badges-provider";
import { EMPTY_NAVIGATION_BADGES, type NavigationBadgeCounts } from "@/lib/navigation/badges";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notifications/client-events";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/hooks/use-user-active", () => ({ useUserActive: () => true }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function Probe() {
  const counts = useNavigationBadges();
  const tip = useGuidedElement("hidden-tip");
  return <><input defaultValue="Primary draft" /><p>chat={counts.chat} tip={String(tip.show)}</p></>;
}

it("settles streamed snapshots without remounting work or flashing a dismissed tip", async () => {
  let settleBadges!: (value: NavigationBadgeCounts) => void;
  let settleGuidance!: (value: GuidanceSnapshot) => void;
  const badges = new Promise<NavigationBadgeCounts>((resolve) => { settleBadges = resolve; });
  const guidance = new Promise<GuidanceSnapshot>((resolve) => { settleGuidance = resolve; });
  await act(() => root.render(
    <NavigationBadgesProvider snapshot={badges}>
      <GuidanceProvider enabled snapshot={guidance}><Probe /></GuidanceProvider>
    </NavigationBadgesProvider>
  ));
  const draft = container.querySelector("input")!;
  draft.value = "Keep my work";
  expect(container.textContent).toContain("tip=false");
  await act(async () => {
    settleBadges({ ...EMPTY_NAVIGATION_BADGES, chat: 7 });
    settleGuidance({ dismissedKeys: ["hidden-tip"], assistantIntroduced: true });
  });
  expect(container.textContent).toContain("chat=7 tip=false");
  expect(container.querySelector("input")).toBe(draft);
  expect(draft.value).toBe("Keep my work");
});

it("recovers a failed badge snapshot immediately without hiding primary work", async () => {
  const fetchReport = vi.fn(async () => Response.json({ ...EMPTY_NAVIGATION_BADGES, chat: 3 }));
  vi.stubGlobal("fetch", fetchReport);
  await act(async () => root.render(
    <NavigationBadgesProvider snapshot={Promise.resolve(null)}>
      <GuidanceProvider enabled snapshot={Promise.resolve(null)}><Probe /></GuidanceProvider>
    </NavigationBadgesProvider>
  ));
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(fetchReport).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("chat=3 tip=false");
  });
  expect(container.querySelector("input")?.value).toBe("Primary draft");
});

it("does not restore unread counts from a snapshot invalidated before it arrived", async () => {
  let settle!: (counts: NavigationBadgeCounts) => void;
  let fresh!: (response: Response) => void;
  const snapshot = new Promise<NavigationBadgeCounts>((resolve) => { settle = resolve; });
  const canonical = new Promise<Response>((resolve) => { fresh = resolve; });
  const fetchCounts = vi.fn(() => canonical);
  vi.stubGlobal("fetch", fetchCounts);
  await act(() => root.render(
    <NavigationBadgesProvider snapshot={snapshot}>
      <GuidanceProvider enabled={false} snapshot={Promise.resolve(null)}><Probe /></GuidanceProvider>
    </NavigationBadgesProvider>
  ));
  await act(() => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT)));
  await act(async () => settle({ ...EMPTY_NAVIGATION_BADGES, chat: 7 }));
  expect(container.textContent).not.toContain("chat=7");
  await vi.waitFor(() => expect(fetchCounts).toHaveBeenCalledOnce());
  await act(async () => fresh(Response.json({ ...EMPTY_NAVIGATION_BADGES, chat: 1 })));
  expect(container.textContent).toContain("chat=1");
});
