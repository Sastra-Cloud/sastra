export const DEFAULT_REACTIONS = ["👍", "❤️", "🙏", "😂", "🎉", "✅", "👀", "🙌"];

/** Prefer personal usage, fill with defaults, and keep the most-used skin variant. */
export function reactionSuggestions(frequent: readonly string[]) {
  const seen = new Set<string>();
  return [...frequent, ...DEFAULT_REACTIONS].filter(emoji => {
    if (!emoji || emoji.length > 16) return false;
    const base = emoji.replace(/\p{Emoji_Modifier}|\uFE0F/gu, "");
    if (seen.has(base)) return false;
    seen.add(base);
    return true;
  }).slice(0, 8);
}
