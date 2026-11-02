import { describe, expect, it } from "vitest";
import { bookSpecPresets, suggestedBookSpecs, type PrintSpecPreset } from "./spec-presets";

function preset(id: string, projectId = id, fields: Partial<PrintSpecPreset> = {}): PrintSpecPreset {
  return { id, projectId, projectTitle: projectId, runTitle: id, trimWidthIn: "6", trimHeightIn: "9", textPaper: "70 gsm cream", coverPaper: "250 gsm matte", binding: "Perfect bound", ...fields };
}

describe("reusing book specifications", () => {
  it("keeps one coherent recent set per book rather than mixing runs or counting reprints as different books", () => {
    const rows = bookSpecPresets([
      preset("empty", "book", { textPaper: " ", coverPaper: null, binding: null }),
      preset("latest", "book", { coverPaper: null }),
      preset("older", "book", { textPaper: "Different paper" }),
      preset("other"),
    ]);
    expect(rows.map(row => row.id)).toEqual(["latest", "other"]);
    expect(rows[0]).toMatchObject({ textPaper: "70 gsm cream", coverPaper: null });
  });
  it("uses this project's own specs first and otherwise suggests a commonly used complete set", () => {
    const custom = preset("custom", "current", { binding: "Sewn" });
    const common = preset("common");
    const rows = [custom, common, preset("another", "another", { trimWidthIn: "6.00", textPaper: "70 GSM cream" })];
    expect(suggestedBookSpecs(rows, "current")?.id).toBe("custom");
    expect(suggestedBookSpecs(rows, "new-book")?.id).toBe("common");
    expect(suggestedBookSpecs([], "new-book")).toBeNull();
  });
});
