import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppCanvas, ContentColumn, PageShell } from "./cockpit";

describe("authenticated page geometry", () => {
  it("uses the Projects width for the shared app canvas", () => {
    const markup = renderToStaticMarkup(<AppCanvas>Content</AppCanvas>);

    expect(markup).toContain("data-app-canvas");
    expect(markup).toContain("max-w-[88rem]");
  });

  it("keeps PageShell responsible for rhythm rather than width", () => {
    const markup = renderToStaticMarkup(<PageShell>Content</PageShell>);

    expect(markup).toContain("space-y-6");
    expect(markup).not.toContain("max-w-");
    expect(markup).not.toContain("mx-auto");
  });

  it.each([
    ["compact", "max-w-2xl"],
    ["focused", "max-w-3xl"],
    ["reading", "max-w-6xl"],
    ["full", "max-w-none"],
  ] as const)("maps the %s content column to %s", (width, expectedClass) => {
    const markup = renderToStaticMarkup(
      <ContentColumn width={width}>Content</ContentColumn>
    );

    expect(markup).toContain(expectedClass);
  });
});
