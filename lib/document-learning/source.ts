import "server-only";

/** Bounded text for local matching and manager-reviewed examples. */
export async function documentCueText(buffer: Buffer, mimeType: string): Promise<string> {
  try {
    if (mimeType === "application/pdf") {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
      try {
        const document = await task.promise;
        const pages: string[] = [];
        for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 3); pageNumber++) {
          const page = await document.getPage(pageNumber);
          const content = await page.getTextContent();
          pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
        }
        return pages.join("\n").slice(0, 6000);
      } finally {
        await task.destroy();
      }
    }
    if (mimeType.includes("wordprocessingml")) {
      const mammoth = await import("mammoth");
      return (await mammoth.extractRawText({ buffer })).value.slice(0, 6000);
    }
    if (mimeType.startsWith("text/")) return buffer.toString("utf8", 0, 6000);
  } catch {
    // Scanned PDFs and damaged text layers can still be reviewed by the model.
  }
  return "";
}
