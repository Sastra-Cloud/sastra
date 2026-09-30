import { describe, expect, it } from "vitest";
import { appNavigation, settingsNavigation, navigationItemActive, projectNavigation } from "./navigation";

describe("navigation permissions and preserved destinations", () => {
  it.each([{ canManage: false, isAdmin: false }, { canManage: true, isAdmin: false }, { canManage: true, isAdmin: true }])("keeps manager and admin destinations within their role boundaries (%o)", access => {
    for (const groups of [appNavigation(access), settingsNavigation(access)]) {
      const items = groups.flatMap(group => group.items);
      expect(items.filter(item => item.access === "manager").length > 0).toBe(access.canManage);
      expect(items.filter(item => item.access === "admin").length > 0).toBe(access.isAdmin);
    }
  });
  it("keeps Schedule and Workload selected inside Team planning without prefix collisions", () => {
    const planning = appNavigation({ canManage: true, isAdmin: false }).flatMap(group => group.items).find(item => item.href === "/overview")!;
    expect(navigationItemActive("/schedule", planning)).toBe(true);
    expect(navigationItemActive("/workload", planning)).toBe(true);
    expect(navigationItemActive("/overview/due-dates", planning)).toBe(true);
    expect(navigationItemActive("/overviews", planning)).toBe(false);
  });
  it.each([["book", "Print", "print"], ["article", "Print", "print"], ["podcast", "Episodes", "episodes"], ["video_series", "Videos", "episodes"]])("preserves specialist URLs for %s", (kind, label, route) => {
    const nav = projectNavigation("sample", kind);
    expect(nav.publishing.map(item => item.href)).toEqual(["/projects/sample/rights", "/projects/sample/budget", `/projects/sample/${route}`]);
    expect(nav.publishing[2].label).toBe(label);
    expect(nav.daily.map(item => item.label)).toEqual(["Overview", "Tasks", "Chat"]);
  });
});
