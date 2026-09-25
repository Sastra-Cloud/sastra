import { afterEach, describe, expect, it } from "vitest";

import { hasTrustedRequestOrigin } from "./request-origin";

const originalAuthUrl = process.env.BETTER_AUTH_URL;

afterEach(() => {
  if (originalAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = originalAuthUrl;
});

describe("hasTrustedRequestOrigin", () => {
  it("accepts the direct request origin", () => {
    const request = new Request("https://sastra.example/api/wiki/media/video/upload", {
      headers: { origin: "https://sastra.example" },
    });

    expect(hasTrustedRequestOrigin(request)).toBe(true);
  });

  it("accepts the configured public origin behind a reverse proxy", () => {
    process.env.BETTER_AUTH_URL = "https://sastra.example";
    const request = new Request("http://wiki:3000/api/wiki/media/video/upload", {
      headers: { origin: "https://sastra.example" },
    });

    expect(hasTrustedRequestOrigin(request)).toBe(true);
  });

  it("accepts the public origin forwarded by the proxy", () => {
    delete process.env.BETTER_AUTH_URL;
    const request = new Request("http://wiki:3000/api/wiki/media/video/upload", {
      headers: {
        origin: "https://sastra.example",
        "x-forwarded-host": "sastra.example",
        "x-forwarded-proto": "https",
      },
    });

    expect(hasTrustedRequestOrigin(request)).toBe(true);
  });

  it("rejects foreign and malformed origins", () => {
    process.env.BETTER_AUTH_URL = "https://sastra.example";
    expect(
      hasTrustedRequestOrigin(
        new Request("http://wiki:3000/api/wiki/media/video/upload", {
          headers: { origin: "https://attacker.example" },
        })
      )
    ).toBe(false);
    expect(
      hasTrustedRequestOrigin(
        new Request("http://wiki:3000/api/wiki/media/video/upload", {
          headers: { origin: "not a URL" },
        })
      )
    ).toBe(false);
  });

  it("allows requests without an Origin header", () => {
    expect(
      hasTrustedRequestOrigin(
        new Request("http://wiki:3000/api/wiki/media/video/upload")
      )
    ).toBe(true);
  });
});
