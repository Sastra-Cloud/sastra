import "server-only";

import { Parser } from "htmlparser2";
import sharp from "sharp";
import { fetchPreviewResource } from "@/lib/chat/preview-fetch";

type Preview = { title: string; description: string; image: string | null };

const clean = (value: string, limit: number) => value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);

export function parseLinkPreview(html: string, pageUrl: string): Preview | null {
  const metadata = new Map<string, string>();
  let title = "";
  let inTitle = false;
  const parser = new Parser({
    onopentag(name, attrs) {
      if (name === "body") parser.pause();
      if (name === "title") inTitle = true;
      if (name === "meta") {
        const key = (attrs.property || attrs.name || "").toLowerCase();
        if (!metadata.has(key) && attrs.content) metadata.set(key, attrs.content);
      }
    },
    ontext(text) { if (inTitle) title += text; },
    onclosetag(name) { if (name === "title") inTitle = false; },
  }, { decodeEntities: true });
  parser.end(html);
  title = clean(metadata.get("og:title") || metadata.get("twitter:title") || title, 200);
  if (!title) return null;
  const description = clean(metadata.get("og:description") || metadata.get("twitter:description") || metadata.get("description") || "", 320);
  let image: string | null = null;
  try {
    const candidate = metadata.get("og:image:secure_url") || metadata.get("og:image") || metadata.get("twitter:image");
    if (candidate) {
      const url = new URL(candidate, pageUrl);
      if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !url.port) image = url.href;
    }
  } catch { /* A broken image must not hide usable text metadata. */ }
  return { title, description, image };
}

// Bounded, short-lived, coalesced caches. Responses still require fresh message
// authorization; URLs and metadata never go into a public Next.js/CDN cache.
const previews = new Map<string, { until: number; value: Promise<Preview | null> }>();
const images = new Map<string, { until: number; value: Promise<Buffer | null> }>();
let activeFetches = 0;

async function cached<T>(cache: Map<string, { until: number; value: Promise<T | null> }>, key: string, max: number, load: () => Promise<T | null>) {
  const existing = cache.get(key);
  if (existing && existing.until > Date.now()) return existing.value;
  if (activeFetches >= 8) return null;
  if (cache.size >= max) cache.delete(cache.keys().next().value!);
  activeFetches++;
  const entry = { until: Date.now() + 60_000, value: load().catch(() => null).then(value => {
    entry.until = Date.now() + (value ? 15 * 60_000 : 60_000);
    return value;
  }).finally(() => { activeFetches--; }) };
  cache.set(key, entry);
  return entry.value;
}

export function getLinkPreview(url: string) {
  return cached(previews, url, 200, async () => {
    const page = await fetchPreviewResource(url, "html");
    return parseLinkPreview(page.body.toString("utf8"), page.url);
  });
}

export function getLinkPreviewImage(url: string) {
  return cached(images, url, 32, async () => {
    const image = await fetchPreviewResource(url, "image");
    // Re-encode raster input; never serve arbitrary remote HTML/SVG on our origin.
    return sharp(image.body, { limitInputPixels: 16_000_000, animated: false })
      .rotate().resize({ width: 720, height: 400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 75 }).toBuffer();
  });
}
