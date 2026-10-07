import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { supportConfiguration } from "./config";

export async function supportRequest(
  input: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
) {
  const cfg = supportConfiguration();
  if (!cfg) throw new Error("This installation uses community support.");
  const path = "/support/v1/instance",
    body = JSON.stringify(input),
    timestamp = String(Math.floor(Date.now() / 1000)),
    nonce = randomUUID();
  const signature = createHmac("sha256", cfg.secret)
    .update(
      [
        "POST",
        path,
        timestamp,
        nonce,
        createHash("sha256").update(body).digest("hex"),
      ].join("\n"),
    )
    .digest("hex");
  const r = await fetchImpl(cfg.url + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-support-instance": cfg.instanceId,
      "x-support-timestamp": timestamp,
      "x-support-nonce": nonce,
      "x-support-signature": signature,
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const data = await r
    .json()
    .catch(() => ({ error: "Support is temporarily unavailable." }));
  if (!r.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Support is temporarily unavailable. Please retry.",
    );
  return data;
}
