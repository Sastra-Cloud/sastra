import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionDisclosure } from "./section-disclosure";

describe("disclosure form preservation", () => {
  it("keeps closed fields in the submitted form and displays zero counts", () => {
    const html = renderToStaticMarkup(<form><SectionDisclosure id="details" title="Optional details" summary={0}><input name="estimate" defaultValue="8" /></SectionDisclosure></form>);
    expect(html).not.toContain('open=""');
    expect(html).toContain('name="estimate"');
    expect(html).toContain('value="8"');
    expect(html).toContain('>0</span>');
  });
  it("supports an initially open primary section", () => {
    expect(renderToStaticMarkup(<SectionDisclosure title="Planning" defaultOpen><input name="total" /></SectionDisclosure>)).toContain('open=""');
  });
});
