import { describe, expect, it } from "vitest";

import {
  isCompletedOn,
  matchesAgendaFilter,
  normalizeMyWorkView,
} from "./my-work";

describe("normalizeMyWorkView", () => {
  it("accepts supported views and falls back to focus", () => {
    expect(normalizeMyWorkView("board")).toBe("board");
    expect(normalizeMyWorkView("agenda")).toBe("agenda");
    expect(normalizeMyWorkView("unknown")).toBe("focus");
  });
});

describe("isCompletedOn", () => {
  it("uses the workspace timezone at day boundaries", () => {
    const completedAt = "2026-07-12T18:30:00.000Z";
    expect(isCompletedOn(completedAt, "2026-07-13", "Asia/Phnom_Penh")).toBe(
      true
    );
    expect(isCompletedOn(completedAt, "2026-07-12", "America/Los_Angeles")).toBe(
      true
    );
  });
});

describe("matchesAgendaFilter", () => {
  it("keeps tasks, rights, and finance obligations distinct", () => {
    expect(matchesAgendaFilter("task", "tasks")).toBe(true);
    expect(matchesAgendaFilter("license_renewal", "rights")).toBe(true);
    expect(matchesAgendaFilter("mou_payment", "finance")).toBe(true);
    expect(matchesAgendaFilter("project_due", "finance")).toBe(false);
  });
});
