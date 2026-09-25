/**
 * Avatar helpers shared by server and client. New profile photos use an
 * authenticated, database-backed path. Legacy file ids still resolve through
 * the access-controlled file proxy, while full URLs/paths pass through.
 */

export function avatarSrc(image: string | null | undefined): string | null {
  if (!image) return null;
  if (image.startsWith("http") || image.startsWith("/")) return image;
  return `/api/files/${image}/download?inline=1`;
}

/** First letters of the first two words, uppercased (e.g. "Alice Bob" → "AB"). */
export function initials(name: string): string {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}
