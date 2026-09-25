import { describe, expect, it } from "vitest";

import { DEFAULT_PLAN_TEMPLATES } from "./default-templates";

describe("article collection templates", () => {
  it.each(["article-translation", "article-av"])(
    "%s fans production and publication tasks out per article",
    (key) => {
      const template = DEFAULT_PLAN_TEMPLATES.find((item) => item.key === key);
      expect(template).toBeDefined();

      const phases = new Map(template!.phases.map((phase) => [phase.name, phase]));
      for (const phaseName of [
        "Translation",
        "Editing",
        "Proofreading",
        "Publication",
      ]) {
        expect(phases.get(phaseName)?.tasks.every((task) => task.perUnit)).toBe(true);
      }
    }
  );

  it("fans article AV production out per article", () => {
    const template = DEFAULT_PLAN_TEMPLATES.find(
      (item) => item.key === "article-av"
    );
    const production = template?.phases.find(
      (phase) => phase.name === "Audio / Video Production"
    );
    expect(production?.tasks.every((task) => task.perUnit)).toBe(true);
  });
});

describe("podcast production template", () => {
  it("fans episode production and publication tasks out per episode", () => {
    const template = DEFAULT_PLAN_TEMPLATES.find(
      (item) => item.key === "podcast-production"
    );
    expect(template).toBeDefined();

    const phases = new Map(template!.phases.map((phase) => [phase.name, phase]));
    for (const phaseName of [
      "Translation",
      "Audio Production",
      "Review & Approval",
      "Video Production",
      "Publication & Promotion",
    ]) {
      expect(phases.get(phaseName)?.tasks.every((task) => task.perUnit)).toBe(
        true
      );
    }
  });
});
