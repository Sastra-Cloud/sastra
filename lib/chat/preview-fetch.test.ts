import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:http", () => ({ request: mocks.request }));
vi.mock("node:https", () => ({ request: mocks.request }));
import { fetchPreviewResource, isPublicPreviewAddress } from "./preview-fetch";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.lookup.mockResolvedValue([{ address: "93.184.215.14", family: 4 }]);
});

function responses(...pages: Array<{ body?: string; status?: number; headers?: Record<string, string> }>) {
  for (const page of pages) {
    mocks.request.mockImplementationOnce((_url, _options, callback) => {
      const request = new EventEmitter();
      Object.assign(request, { end() {
        const response = Readable.from([Buffer.from(page.body ?? "")]);
        Object.assign(response, { statusCode: page.status ?? 200, headers: { "content-type": "text/html", ...page.headers } });
        callback(response);
      } });
      return request;
    });
  }
}

it("rejects private, special, obfuscated and mapped addresses while retaining public IPv4/IPv6", () => {
  for (const address of ["127.0.0.1", "0.0.0.0", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "224.0.0.1", "::1", "::", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "2001:db8::1", "64:ff9b::7f00:1"]) {
    expect(isPublicPreviewAddress(address), address).toBe(false);
  }
  expect(isPublicPreviewAddress("93.184.215.14")).toBe(true);
  expect(isPublicPreviewAddress("2606:4700:4700::1111")).toBe(true);
});

it("rejects mixed DNS answers, unsafe schemes, credentials, ports and normalized loopback before connecting", async () => {
  mocks.lookup.mockResolvedValue([{ address: "93.184.215.14", family: 4 }, { address: "10.0.0.1", family: 4 }]);
  for (const url of ["https://example.org/", "file:///etc/passwd", "https://user:pass@example.org/", "https://example.org:5432/", "http://2130706433/"]) {
    await expect(fetchPreviewResource(url, "html")).rejects.toThrow();
  }
  expect(mocks.request).not.toHaveBeenCalled();
});

it("pins DNS for the actual connection and revalidates redirects before a second connection", async () => {
  responses({ status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
  await expect(fetchPreviewResource("http://example.org/", "html")).rejects.toThrow("Non-public");
  expect(mocks.request).toHaveBeenCalledTimes(1);
  const options = mocks.request.mock.calls[0][1];
  const resolved = vi.fn();
  options.lookup("example.org", {}, resolved);
  expect(resolved).toHaveBeenCalledWith(null, "93.184.215.14", 4);
  expect(options.headers).not.toHaveProperty("Cookie");
  expect(options.headers).not.toHaveProperty("Authorization");
});

it("supports public relative redirects but rejects insecure redirects, oversized bodies and non-HTML responses", async () => {
  responses({ status: 302, headers: { location: "/article" } }, { body: "<title>Article</title>" });
  expect(await fetchPreviewResource("https://example.org/", "html")).toEqual({ body: Buffer.from("<title>Article</title>"), url: "https://example.org/article" });
  responses({ status: 302, headers: { location: "http://example.org/" } });
  await expect(fetchPreviewResource("https://example.org/", "html")).rejects.toThrow("Insecure");
  responses({ body: "x".repeat(512 * 1024 + 1) });
  await expect(fetchPreviewResource("https://example.org/", "html")).rejects.toThrow();
  responses({ headers: { "content-type": "image/svg+xml" } });
  await expect(fetchPreviewResource("https://example.org/", "image")).rejects.toThrow();
});
