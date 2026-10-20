/** Native downloads keep the current app page; previews open actual inline content. */
export function fileLinkAttributes(href: string, intent: "download" | "preview" = "download") {
  if (intent === "download") return { href, download: true as const };

  // These authenticated routes support inline previews. Preserve cache/version
  // parameters and never add application-specific parameters to external URLs.
  const url = new URL(href, "https://app.invalid");
  if (href.startsWith("/api/") && (
    /^\/api\/files\/[^/]+\/download$/.test(url.pathname) ||
    /^\/api\/invoices\/[^/]+$/.test(url.pathname) ||
    /^\/api\/projects\/[^/]+\/budget\/partner-pdf$/.test(url.pathname)
  )) {
    url.searchParams.set("inline", "1");
    href = `${url.pathname}${url.search}${url.hash}`;
  }
  return { href, target: "_blank", rel: "noopener noreferrer" };
}
