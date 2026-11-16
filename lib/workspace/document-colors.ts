import { z } from "zod";

const hexColor = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color such as #315A78.");
export const documentColorsSchema = z.object({ accentColor: hexColor, tableHeaderColor: hexColor });
export type DocumentColors = z.infer<typeof documentColorsSchema>;

/** Choose readable text for both light and dark document table headers. */
export function documentColors(fallback: string, override?: DocumentColors | null) {
  const accentColor = override?.accentColor ?? fallback;
  const tableHeaderColor = /^#[0-9a-fA-F]{6}$/.test(override?.tableHeaderColor ?? "")
    ? override!.tableHeaderColor : /^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : "#B65C3A";
  const channels = tableHeaderColor.slice(1).match(/../g)!.map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return { accentColor, tableHeaderColor, tableHeaderTextColor: luminance > 0.179 ? "#000000" : "#FFFFFF" };
}
