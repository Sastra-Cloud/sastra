import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MyWorkAttentionSummary } from "./my-work-attention-summary";
import { EMPTY_NAVIGATION_BADGES } from "@/lib/navigation/badges";

describe("personal badge explanation", () => {
  it("explains eight as six due tasks plus two owned email follow-ups", () => {
    const html = renderToStaticMarkup(<MyWorkAttentionSummary counts={{ ...EMPTY_NAVIGATION_BADGES, dueTasks: 6, followUps: 2, correspondence: 9 }} onShowDueTasks={() => {}} />);
    expect(html).toContain("8 actions for you");
    expect(html).toContain("6 tasks due");
    expect(html).toContain("2 email follow-ups");
    expect(html).toContain('href="#external-follow-ups"');
    expect(html).toContain("printer-payment follow-ups");
  });

  it("includes personal reviews without including unrelated unread or shared counts", () => {
    const html = renderToStaticMarkup(<MyWorkAttentionSummary counts={{ ...EMPTY_NAVIGATION_BADGES, taskSuggestions: 1, chat: 99, correspondence: 5 }} onShowDueTasks={() => {}} />);
    expect(html).toContain("1 action for you");
    expect(html).toContain("1 suggestion to review");
    expect(html).toContain('href="#suggestions"');
    expect(html).not.toContain("99");
  });

  it("does not add an empty attention panel", () => {
    expect(renderToStaticMarkup(<MyWorkAttentionSummary counts={EMPTY_NAVIGATION_BADGES} onShowDueTasks={() => {}} />)).toBe("");
  });
});
