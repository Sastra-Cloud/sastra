/**
 * Upload rules shared by the browser and the server. The browser checks a file
 * when it is chosen, so a file that cannot be stored never starts an upload;
 * the server checks again and is the real boundary.
 */

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

// Allowlist of accepted MIME types (publishing docs, images, office, archives).
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "text/calendar",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.adobe.indesign-idml-package",
  "application/epub+zip",
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/webm",
  "audio/ogg",
  "video/mp4",
  "video/quicktime",
]);

/**
 * Types for allowed files that browsers often report with no type, or with a
 * name of their own (Windows calls a zip `application/x-zip-compressed`).
 */
const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
  ics: "text/calendar",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  odt: "application/vnd.oasis.opendocument.text",
  idml: "application/vnd.adobe.indesign-idml-package",
  epub: "application/epub+zip",
};

function baseType(mime: string): string {
  return mime.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME.has(baseType(mime));
}

export function validateUpload(mime: string, size: number): string | null {
  if (!isAllowedMime(mime)) {
    return "This file type can't be uploaded. Use a PDF, image, Word, Excel, or zip file.";
  }
  if (size <= 0) return "This file is empty. Choose another file.";
  if (size > MAX_FILE_BYTES) return "This file is over the 50 MB limit. Choose a smaller file.";
  return null;
}

/**
 * The content type to upload a file with. The browser's own type wins when it
 * is allowed; otherwise a known file ending decides, because browsers leave the
 * type empty for endings they do not know.
 */
export function uploadContentType(file: { name: string; type: string }): string {
  if (file.type && isAllowedMime(file.type)) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[extension] ?? (file.type || "application/octet-stream");
}
