export type DownloadResult =
  | { status: "ready"; blob: Blob }
  | { status: "failed"; error: string }
  /** The response could not be read here; the browser may still download it. */
  | { status: "unreadable" };

/**
 * Fetch a file so a refused or failed request becomes a message for the person
 * instead of a saved error file. A plain download link saves whatever the
 * server answers, including a JSON error body.
 */
export async function fetchDownload(
  href: string,
  fetcher: typeof fetch = fetch,
): Promise<DownloadResult> {
  let response: Response;
  try {
    response = await fetcher(href, { credentials: "same-origin" });
  } catch {
    // Stored files redirect to object storage, which scripts may not read.
    return { status: "unreadable" };
  }
  if (response.ok) return { status: "ready", blob: await response.blob() };
  return { status: "failed", error: await downloadErrorMessage(response) };
}

async function downloadErrorMessage(response: Response): Promise<string> {
  if (response.status === 401) {
    return "Your sign-in ended. Sign in again, then download the attachment.";
  }
  if (response.status === 403) {
    return "You do not have permission to download this attachment. Ask an admin for help.";
  }
  if (response.status === 404) {
    return "This attachment was not found. Refresh the page and try again.";
  }
  if (response.status === 400) {
    // Budget and invoice routes explain what to fix in plain language.
    const body: unknown = await response.json().catch(() => null);
    const reason =
      body && typeof body === "object" && "error" in body ? body.error : null;
    if (typeof reason === "string" && reason.trim()) {
      return `Couldn't make this attachment. ${reason.trim()}`;
    }
  }
  return "Couldn't download this attachment. Check your internet and try again.";
}
