"use client";

/**
 * Helpers for the interactive avatar cropper. The cropper (react-easy-crop)
 * reports a pixel crop region against the source image; we draw that region into
 * a fixed square canvas and re-encode to WebP so stored avatars stay small.
 */

export type PixelCrop = { x: number; y: number; width: number; height: number };

const OUTPUT = 512;
const MAX_INPUT_BYTES = 12 * 1024 * 1024; // 12 MB before cropping

export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Please choose an image file.";
  if (file.size > MAX_INPUT_BYTES) return "Image is too large (max 12 MB).";
  return null;
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read that image."));
    reader.readAsDataURL(file);
  });
}

export async function cropToFile(
  src: string,
  area: PixelCrop,
  name = "avatar"
): Promise<File> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't process images here.");
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    OUTPUT,
    OUTPUT
  );
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9)
  );
  if (!blob) throw new Error("Couldn't process that image.");
  return new File([blob], `${name}.webp`, { type: "image/webp" });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image."));
    img.src = src;
  });
}
