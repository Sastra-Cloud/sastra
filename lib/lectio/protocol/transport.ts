import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { IntegrationError, SNAPSHOT_LIMIT } from "./contract";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList(); globalV6.addSubnet("2000::", 3, "ipv6");
blocked.addSubnet("2001::", 23, "ipv6"); blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
export function publicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, "ipv4") :
    family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}
function developmentOrigin(origin: string) {
  return process.env.NODE_ENV !== "production" &&
    (process.env.TRANSLATION_INTEGRATION_DEV_ORIGINS ?? "").split(",").includes(origin);
}
export function integrationOrigin(input: string): string {
  let url: URL;
  try { url = new URL(input); } catch { throw new IntegrationError("invalid_origin", "Enter the app's full HTTPS address."); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
    (!developmentOrigin(url.origin) && (url.protocol !== "https:" || (url.port && url.port !== "443")))) {
    throw new IntegrationError("invalid_origin", "Use the app's HTTPS origin without a path or credentials.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new IntegrationError("invalid_origin", "Unsupported address.");
  return url.origin;
}

/** Resolve once, validate every answer, and pin the socket to that answer. Never follow redirects. */
export async function integrationRequest(origin: string, path: string, options: {
  method?: string; headers?: Record<string, string>; body?: string | Uint8Array; maxBytes?: number;
} = {}): Promise<{ status: number; body: Buffer; retryAfter: string | null }> {
  const base = integrationOrigin(origin);
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\r\n#]/.test(path)) {
    throw new IntegrationError("invalid_target", "Invalid integration request path.");
  }
  const url = new URL(path, base);
  if (url.origin !== base) throw new IntegrationError("invalid_target", "Invalid integration request origin.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new IntegrationError("network_timeout", "The other app did not respond.", 504)), 10_000); }),
  ]).finally(() => clearTimeout(timer));
  const local = developmentOrigin(base);
  if (!addresses.length || addresses.some(a => !publicAddress(a.address) &&
    !(local && ["127.0.0.1", "::1"].includes(a.address)))) {
    throw new IntegrationError("unsafe_origin", "The other app must use a public network address.");
  }
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(url, { method: options.method ?? "GET", headers: options.headers, agent: false,
      lookup: (_host, lookupOptions, callback) => {
        if (lookupOptions.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
    }, response => {
      const chunks: Buffer[] = []; let length = 0;
      response.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > (options.maxBytes ?? SNAPSHOT_LIMIT)) {
          req.destroy(new IntegrationError("payload_too_large", "The other app returned too much data.", 413));
        } else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode ?? 502, body: Buffer.concat(chunks),
        retryAfter: typeof response.headers["retry-after"] === "string" ? response.headers["retry-after"] : null }));
    });
    const deadline = setTimeout(() => req.destroy(new IntegrationError("network_timeout", "The other app did not respond.", 504)), 15_000);
    req.on("close", () => clearTimeout(deadline));
    req.on("error", (error) => reject(error instanceof IntegrationError ? error : new IntegrationError("network_error", "Cannot reach the other app. Retry shortly.", 502)));
    req.end(options.body);
  });
}

export async function integrationJson<T>(origin: string, path: string, options: Parameters<typeof integrationRequest>[2] = {}): Promise<T> {
  const response = await integrationRequest(origin, path, options);
  if (response.status < 200 || response.status >= 300) {
    // Do not surface arbitrary remote HTML, secrets, or untrusted error messages.
    throw new IntegrationError(response.status === 401 ? "connection_revoked" : "remote_error",
      response.status === 401 ? "Reconnect this integration to continue." : "The other app could not complete the request.", response.status);
  }
  try { return JSON.parse(response.body.toString("utf8")) as T; }
  catch { throw new IntegrationError("invalid_response", "The other app returned an invalid response.", 502); }
}
