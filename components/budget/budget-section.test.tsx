import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BudgetSection, BudgetTabs } from "./budget-section";

describe("budget tab editor retention", () => {
  it("renders inactive editors mounted and hidden, with their draft values intact", () => {
    const html = renderToStaticMarkup(
      <BudgetTabs sections={[{ id: "planning", label: "Quotation" }, { id: "operations-notes", label: "Notes" }]}>
        <BudgetSection id="planning" title="Quotation" description="Costs">
          <input name="quantity" defaultValue="1200" />
        </BudgetSection>
        <BudgetSection id="operations-notes" title="Notes" description="Discussion">
          <textarea name="draft" defaultValue="Keep this budget draft" />
        </BudgetSection>
      </BudgetTabs>
    );
    const panels = html.match(/<div[^>]*role="tabpanel"[^>]*>/g) ?? [];
    expect(panels).toHaveLength(2);
    expect(panels.filter(panel => panel.includes(' hidden=""'))).toHaveLength(1);
    expect(html).toContain('name="quantity" value="1200"');
    expect(html).toContain('name="draft">Keep this budget draft</textarea>');
    expect(html).toContain('id="operations-notes"');
    expect(html).not.toContain("<details");
  });
});
