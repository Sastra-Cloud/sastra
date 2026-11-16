import { expect, it, vi } from "vitest";

vi.mock("@/lib/chat/preview-fetch", () => ({ fetchPreviewResource: vi.fn() }));
import { fetchPreviewResource } from "./preview-fetch";
import { getLinkPreview, getLinkPreviewImage, parseLinkPreview } from "./link-preview";

it("uses decoded Open Graph metadata with a relative image and never trusts a site's replacement link", () => {
  const preview = parseLinkPreview(`<head><title>Fallback</title>
    <meta content="Art &amp; កម្មវិធី" property="og:title">
    <meta name="description" content="Fallback description">
    <meta property="og:description" content="Tools &quot;for&quot; everyone">
    <meta property="og:image" content="/preview.png">
    <meta property="og:url" content="javascript:alert(1)"></head>
    <body><meta property="og:image" content="https://tracker.example/x"></body>`, "https://example.org/app");
  expect(preview).toEqual({ title: "Art & កម្មវិធី", description: 'Tools "for" everyone', image: "https://example.org/preview.png" });
  expect(parseLinkPreview('<title>Plain &amp; useful</title><meta name="description" content="Details"><meta property="og:image" content="data:image/svg+xml,bad">', "https://example.org/")).toEqual({ title: "Plain & useful", description: "Details", image: null });
  expect(parseLinkPreview("<body>No metadata</body>", "https://example.org/")).toBeNull();
});

it("coalesces duplicate requests and degrades to no preview when a site fails", async () => {
  vi.mocked(fetchPreviewResource).mockResolvedValueOnce({ body: Buffer.from("<title>Shared</title>"), url: "https://example.org/shared" });
  const results = await Promise.all([getLinkPreview("https://example.org/shared"), getLinkPreview("https://example.org/shared")]);
  expect(results[0]?.title).toBe("Shared");
  expect(results[1]).toEqual(results[0]);
  expect(fetchPreviewResource).toHaveBeenCalledTimes(1);
  vi.mocked(fetchPreviewResource).mockRejectedValueOnce(new Error("Timed out"));
  expect(await getLinkPreview("https://example.org/unavailable")).toBeNull();
});

it("re-encodes preview images and rejects disguised active content", async () => {
  const sharp = (await import("sharp")).default;
  const source = await sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } }).png().toBuffer();
  vi.mocked(fetchPreviewResource).mockResolvedValueOnce({ body: source, url: "https://example.org/image" });
  const image = await getLinkPreviewImage("https://example.org/image");
  expect((await sharp(image!).metadata()).format).toBe("webp");
  vi.mocked(fetchPreviewResource).mockResolvedValueOnce({ body: Buffer.from("<html><script>alert(1)</script></html>"), url: "https://example.org/disguised" });
  expect(await getLinkPreviewImage("https://example.org/disguised")).toBeNull();
});
