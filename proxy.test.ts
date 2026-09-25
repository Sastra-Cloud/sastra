import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { proxy } from "./proxy";

describe("authentication proxy", () => {
  it("keeps private Wiki media APIs behind the session gate", () => {
    const response = proxy(
      new NextRequest("https://sastra.example/api/wiki/media/video/upload")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://sastra.example/login?redirect=%2Fapi%2Fwiki%2Fmedia%2Fvideo%2Fupload"
    );
  });

  it("lets the secret-protected dependency webhook reach its route handler", () => {
    const response = proxy(
      new NextRequest("https://sastra.example/api/security/dependency-status")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
