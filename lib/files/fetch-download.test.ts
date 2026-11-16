import { expect, it } from "vitest";

import { fetchDownload } from "./fetch-download";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

it("reports a refused or failed download instead of handing back the error body", async () => {
  const refused = await fetchDownload("/api/x", async () =>
    json(403, { error: "Forbidden" }),
  );
  expect(refused).toEqual({
    status: "failed",
    error: expect.stringContaining("do not have permission"),
  });

  const needsSetup = await fetchDownload("/api/x", async () =>
    json(400, { error: "Set up the partner quote before exporting it." }),
  );
  expect(needsSetup).toEqual({
    status: "failed",
    error:
      "Couldn't make this attachment. Set up the partner quote before exporting it.",
  });
});

it("returns the file when the server sends it, and defers to the browser when the response cannot be read", async () => {
  const ready = await fetchDownload("/api/x", async () => new Response("sheet"));
  expect(ready.status).toBe("ready");
  expect(ready.status === "ready" && (await ready.blob.text())).toBe("sheet");

  const blocked = await fetchDownload("/api/x", async () => {
    throw new TypeError("Failed to fetch");
  });
  expect(blocked).toEqual({ status: "unreadable" });
});
