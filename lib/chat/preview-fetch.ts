import "server-only";

import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

export function isPublicPreviewAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === "unicast"; }
  catch { return false; }
}

function previewUrl(value: string): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port || value.length > 4096) {
    throw new Error("Unsupported preview URL");
  }
  return url;
}

/** Resolve once, validate every answer, then pin the connection to that address.
 * Never use automatic redirects: each hop goes through the same validation.
 * No browser cookies, authorization, referrer, or workspace headers are sent.
 */
export async function fetchPreviewResource(value: string, kind: "html" | "image") {
  const signal = AbortSignal.timeout(6000);
  let url = previewUrl(value);
  const limit = kind === "html" ? 512 * 1024 : 3 * 1024 * 1024;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await Promise.race([
        lookup(hostname, { all: true }),
        new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
      ]);
    if (!addresses.length || addresses.some(entry => !isPublicPreviewAddress(entry.address))) {
      throw new Error("Non-public preview destination");
    }
    signal.throwIfAborted();
    const address = addresses[0];
    const response = await new Promise<{ body: Buffer; location?: string; type: string }>((resolve, reject) => {
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
        signal,
        agent: false,
        family: address.family,
        // Node otherwise does a second DNS lookup, opening a rebinding window.
        lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
        headers: {
          "User-Agent": "Sastra-LinkPreview/1.0",
          Accept: kind === "html" ? "text/html,application/xhtml+xml" : "image/jpeg,image/png,image/webp,image/gif",
          "Accept-Encoding": "identity",
        },
      }, response => {
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          resolve({ body: Buffer.alloc(0), location: response.headers.location, type: "" });
          response.destroy();
          return;
        }
        const type = response.headers["content-type"]?.split(";")[0].trim().toLowerCase() ?? "";
        const allowed = kind === "html" ? ["text/html", "application/xhtml+xml"] : ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (status < 200 || status >= 300 || !allowed.includes(type) || Number(response.headers["content-length"]) > limit) {
          reject(new Error("Unsupported preview response"));
          response.destroy();
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > limit) response.destroy(new Error("Preview too large"));
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("aborted", () => reject(new Error("Incomplete preview")));
        response.on("end", () => resolve({ body: Buffer.concat(chunks), type }));
      });
      request.on("error", reject);
      request.end();
    });
    if (!response.location) return { body: response.body, url: url.href };
    const destination = previewUrl(new URL(response.location, url).href);
    if (url.protocol === "https:" && destination.protocol !== "https:") throw new Error("Insecure redirect");
    url = destination;
  }
  throw new Error("Too many preview redirects");
}
