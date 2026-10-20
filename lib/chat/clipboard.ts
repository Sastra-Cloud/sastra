/** Read clipboard images once, without treating ordinary text as an attachment. */
export function clipboardImageFiles(
  clipboard: Pick<DataTransfer, "items" | "files">
): File[] {
  const images: File[] = [];
  for (const item of Array.from(clipboard.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) images.push(file);
  }

  // Some browsers only expose pasted files through `files`. Do not read both
  // representations when items succeeded, or each image would be added twice.
  return images.length > 0
    ? images
    : Array.from(clipboard.files).filter((file) => file.type.startsWith("image/"));
}
