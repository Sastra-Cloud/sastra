import { expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

it("lets the backchannel reach its intent verifier while keeping setup mutations and neighboring paths behind login", () => {
  const path = "https://source.example/api/integrations/lectio/connect";
  expect(proxy(new NextRequest(path + "?state=pending-state")).headers.get("x-middleware-next")).toBe("1");
  expect(proxy(new NextRequest(path, { method: "POST" })).status).toBe(307);
  expect(proxy(new NextRequest(path + "/other")).status).toBe(307);
});
