import devices from "./apple-startup-devices.json";

// iOS ignores the web manifest's splash and only shows a launch image when one
// matches the device's exact CSS size, pixel ratio, and orientation. The PNGs
// are generated from the same device list by scripts/gen-icons.mjs.
const sizes = devices.flatMap(({ width, height, ratio }) =>
  (["portrait", "landscape"] as const).map((orientation) => {
    const [w, h] =
      orientation === "portrait"
        ? [width * ratio, height * ratio]
        : [height * ratio, width * ratio];
    return {
      file: `apple-splash-${w}x${h}`,
      media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: ${orientation})`,
    };
  })
);

// Light links carry no color-scheme condition so they always match; the dark
// links come after them and win when the phone is in dark mode. iOS saves the
// image when the app is added to the Home Screen.
export const appleStartupImages = [
  ...sizes.map(({ file, media }) => ({ url: `/splash/${file}.png`, media })),
  ...sizes.map(({ file, media }) => ({
    url: `/splash/${file}-dark.png`,
    media: `${media} and (prefers-color-scheme: dark)`,
  })),
];
