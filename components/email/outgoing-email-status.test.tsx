import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OutgoingEmailStatus } from "./outgoing-email-status";

describe("OutgoingEmailStatus", () => {
  it("renders nothing when there is no delivery state", () => {
    expect(
      renderToStaticMarkup(<OutgoingEmailStatus delivery={null} />)
    ).toBe("");
  });

  it("renders a real delivery state", () => {
    const markup = renderToStaticMarkup(
      <OutgoingEmailStatus
        delivery={{
          status: "sending",
          label: "Invoice email",
          recipient: "finance@example.com",
        }}
      />
    );

    expect(markup).toContain("Sending invoice email");
    expect(markup).toContain("finance@example.com");
  });
});
