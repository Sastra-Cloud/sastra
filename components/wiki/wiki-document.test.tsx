import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WikiDocumentView } from "./wiki-document";

describe("WikiDocumentView", () => {
  it("sends the site origin required by YouTube embeds", () => {
    const markup = renderToStaticMarkup(
      <WikiDocumentView
        document={{
          type: "doc",
          content: [
            {
              type: "externalEmbed",
              attrs: {
                provider: "youtube",
                externalId: "2w-R7xr8cp0",
                url: "https://youtu.be/2w-R7xr8cp0?si=tracking-token",
              },
            },
          ],
        }}
      />
    );

    expect(markup).toContain(
      'src="https://www.youtube-nocookie.com/embed/2w-R7xr8cp0"'
    );
    expect(markup).toContain(
      'referrerPolicy="strict-origin-when-cross-origin"'
    );
  });
});
