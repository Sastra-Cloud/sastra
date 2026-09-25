import { appUrl } from "./transport";

/** Substitute {{variable}} placeholders; auto-injects appUrl + year. */
export function renderTemplate(
  template: string,
  variables: Record<string, string> = {}
): string {
  const allVars: Record<string, string> = {
    appUrl,
    year: String(new Date().getFullYear()),
    ...variables,
  };
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) => allVars[key] ?? m);
}

/** Escape user-supplied values before interpolating into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Strip HTML to a plain-text fallback so every message ships html + text. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/(h1|h2|h3|li|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&middot;/g, "·")
    .replace(/&mdash;/g, "—")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
