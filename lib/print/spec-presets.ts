export type PrintSpecPreset = {
  id: string;
  projectId: string;
  projectTitle: string;
  runTitle: string;
  trimWidthIn: string;
  trimHeightIn: string;
  textPaper: string | null;
  coverPaper: string | null;
  binding: string | null;
};

/** Newest usable specification per book; never combine fields from different runs. */
export function bookSpecPresets(rows: PrintSpecPreset[]): PrintSpecPreset[] {
  const books = new Map<string, PrintSpecPreset>();
  for (const row of rows) {
    if (books.has(row.projectId)) continue;
    const preset = {
      ...row,
      textPaper: row.textPaper?.trim() || null,
      coverPaper: row.coverPaper?.trim() || null,
      binding: row.binding?.trim() || null,
    };
    if (!preset.textPaper && !preset.coverPaper && !preset.binding) continue;
    books.set(row.projectId, preset);
  }
  return [...books.values()];
}

/** Prefer this book's own specs, otherwise the most-used complete set of specs. */
export function suggestedBookSpecs(presets: PrintSpecPreset[], projectId: string) {
  const current = presets.find(preset => preset.projectId === projectId);
  if (current) return current;
  const groups = new Map<string, { preset: PrintSpecPreset; count: number; complete: boolean }>();
  for (const preset of presets) {
    const key = JSON.stringify([
      Number(preset.trimWidthIn), Number(preset.trimHeightIn),
      preset.textPaper?.toLowerCase(), preset.coverPaper?.toLowerCase(), preset.binding?.toLowerCase(),
    ]);
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { preset, count: 1, complete: !!(preset.textPaper && preset.coverPaper && preset.binding) });
  }
  return [...groups.values()].sort((a, b) => Number(b.complete) - Number(a.complete) || b.count - a.count)[0]?.preset ?? null;
}
