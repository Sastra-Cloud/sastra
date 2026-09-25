// Regenerates favicon / PWA / apple-touch icons from the Sastra brand mark.
// Source: public/sastra-logo.svg. Run: node scripts/gen-icons.mjs
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { copyFile, mkdir, writeFile } from "node:fs/promises";

const SRC = "public/sastra-logo.svg";
const DENSITY = 1200; // render the small viewBox crisply before downscaling

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const white = { r: 255, g: 255, b: 255, alpha: 1 };

// Full-bleed, transparent — for "any" icons + the favicon.
async function plain(path, size) {
  await sharp(SRC, { density: DENSITY })
    .resize(size, size, { fit: "contain", background: transparent })
    .png()
    .toFile(path);
  console.log("wrote", path, `${size}^2`);
}

// Logo centered at `pct` of the canvas on an opaque bg — for maskable + apple
// (keeps the mark inside the ~80% safe zone; opaque so iOS/Android don't darken).
async function padded(path, size, pct, bg) {
  const inner = Math.round(size * pct);
  const logo = await sharp(SRC, { density: DENSITY })
    .resize(inner, inner, { fit: "contain", background: transparent })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path);
  console.log("wrote", path, `${size}^2 (padded)`);
}

await mkdir("public/icons", { recursive: true });
await plain("public/icons/icon-192.png", 192);
await plain("public/icons/icon-512.png", 512);
await plain("app/icon.png", 512);
await padded("public/icons/icon-maskable-512.png", 512, 0.78, white);
await padded("app/apple-icon.png", 180, 0.82, white);

// Crisp vector favicon for modern browsers.
await copyFile(SRC, "app/icon.svg");

// Multi-resolution favicon.ico (overrides the create-next-app default).
const icoSizes = await Promise.all(
  [16, 32, 48].map((s) =>
    sharp(SRC, { density: DENSITY })
      .resize(s, s, { fit: "contain", background: transparent })
      .png()
      .toBuffer()
  )
);
await writeFile("app/favicon.ico", await pngToIco(icoSizes));
console.log("wrote app/icon.svg + app/favicon.ico");
