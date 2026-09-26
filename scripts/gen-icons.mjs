// Regenerates favicon / PWA / apple-touch / notification icons from the Sastra mark.
// Sources: public/sastra-logo.svg (the mark) and public/sastra-icon.svg (the mark on a
// rounded violet tile). Run: node scripts/gen-icons.mjs
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const MARK = "public/sastra-logo.svg";
const TILE = "public/sastra-icon.svg";
const DENSITY = 1200; // render the small viewBox crisply before downscaling

const VIOLET = "#41396f";
const PAPER = "#faf8f3";
const LILAC = "#e8e3f7";
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

const markSvg = await readFile(MARK, "utf8");
const markIn = (fill) => Buffer.from(markSvg.replaceAll(VIOLET, fill));

// The rounded tile, as is — for "any" icons.
async function tile(path, size) {
  await sharp(TILE, { density: DENSITY }).resize(size, size).png().toFile(path);
  console.log("wrote", path, `${size}^2`);
}

// The mark centred at `share` of the height on a full-bleed square — for maskable and Apple
// icons, which the platform crops itself (keeps the mark inside the ~80% safe zone).
async function square(path, size, share, bg = VIOLET, fg = PAPER) {
  const h = Math.round(size * share);
  const mark = await sharp(markIn(fg), { density: DENSITY })
    .resize({ height: h, fit: "contain", background: transparent })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toFile(path);
  console.log("wrote", path, `${size}^2 (square)`);
}

await mkdir("public/icons", { recursive: true });
await tile("public/icons/icon-192.png", 192);
await tile("public/icons/icon-512.png", 512);
await tile("app/icon.png", 512);
await square("public/icons/icon-maskable-512.png", 512, 0.46);
await square("public/icons/apple-touch-icon.png", 180, 0.56);
await square("app/apple-icon.png", 180, 0.56);

// Android notification badge: only the shape is used, so the bare mark on transparent.
await sharp(markIn("#ffffff"), { density: DENSITY })
  .resize(78, 78, { fit: "contain", background: transparent })
  .extend({ top: 9, bottom: 9, left: 9, right: 9, background: transparent })
  .png()
  .toFile("public/icons/badge-96.png");
console.log("wrote public/icons/badge-96.png");

// Vector favicon for modern browsers: the mark, violet on light tabs and lilac on dark ones.
const paths = [...markSvg.matchAll(/<path[^>]*d="([^"]+)"/g)].map((m) => m[1]);
await writeFile(
  "app/icon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6.25 0 100 100"><style>path{fill:${VIOLET}}@media (prefers-color-scheme: dark){path{fill:${LILAC}}}</style>${paths.map((d) => `<path d="${d}"/>`).join("")}</svg>\n`
);

// Multi-resolution favicon.ico: the tile, so it reads on light and dark tabs alike.
const icoSizes = await Promise.all(
  [16, 32, 48].map((s) => sharp(TILE, { density: DENSITY }).resize(s, s).png().toBuffer())
);
await writeFile("app/favicon.ico", await pngToIco(icoSizes));
console.log("wrote app/icon.svg + app/favicon.ico");
