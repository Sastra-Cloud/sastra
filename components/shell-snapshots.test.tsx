import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GuidanceProvider, useGuidedElement } from "@/components/guidance/guidance-provider";
import {
  NavigationBadgesProvider,
  useNavigationBadges,
} from "@/components/navigation-badges-provider";

function Probe() {
  const counts = useNavigationBadges();
  const tip = useGuidedElement("dashboard-tip");
  return (
    <p>
      page-ready chat={counts.chat} due={counts.dueTasks} tip={String(tip.show)}
    </p>
  );
}

describe("streamed shell state", () => {
  // Protects the first paint: the page must render while coaching and badge
  // data are still loading, and unknown data must not look like real values.
  it("renders the page immediately, with no badge counts and no coaching, until the snapshots arrive", async () => {
    const never = new Promise<never>(() => {});
    const stream = await renderToReadableStream(
      <main>
        <NavigationBadgesProvider snapshot={never}>
          <GuidanceProvider enabled snapshot={never}>
            <Probe />
          </GuidanceProvider>
        </NavigationBadgesProvider>
      </main>
    );
    const html = new TextDecoder()
      .decode((await stream.getReader().read()).value)
      .replaceAll("<!-- -->", "");
    expect(html).toContain("page-ready");
    expect(html).toContain("chat=0");
    expect(html).toContain("due=0");
    expect(html).toContain("tip=false");
  });
});
