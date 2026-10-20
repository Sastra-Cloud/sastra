import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ManagerReviewItem } from "@/lib/dashboard/attention";
import { ManagerReviewQueue } from "./manager-review-queue";

const items: ManagerReviewItem[] = Array.from({ length: 8 }, (_, index) => ({
  id: `review-${index}`,
  source: "project_update",
  title: `Review project ${index}`,
  detail: "Check the proposed change before applying it.",
  project: null,
  priority: index === 0 ? "high" : "medium",
  href: `/projects/project-${index}`,
  actionLabel: "Review project",
  createdAt: null,
}));

describe("manager review access", () => {
  it("keeps Home's preview short and links to the complete review section", () => {
    const html = renderToStaticMarkup(<ManagerReviewQueue items={items} limit={3} />);
    expect(html).toContain("8 items");
    expect(html).toContain('href="/projects/project-2"');
    expect(html).not.toContain('href="/projects/project-3"');
    expect(html).toContain('href="/overview#manager-attention"');
  });

  it("keeps every review accessible in the collapsed planning section", () => {
    const html = renderToStaticMarkup(<ManagerReviewQueue items={items} collapsed />);
    expect(html).toContain('<details id="manager-attention"');
    expect(html).not.toContain('open=""');
    expect(html).toContain("8 items");
    for (const item of items) expect(html).toContain(`href="${item.href}"`);
    expect(html).toContain("High priority");
  });

  it("omits an empty review section", () => {
    expect(renderToStaticMarkup(<ManagerReviewQueue items={[]} collapsed />)).toBe("");
  });
});
