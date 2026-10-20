import { expect, it } from "vitest";
import { fileLinkAttributes } from "./link-attributes";

it("downloads files in the current browsing context instead of leaving a blank app window", () => {
  const attributes = fileLinkAttributes("/api/projects/example/budget/export?audience=partner&run=run-id");
  expect(attributes).toMatchObject({ download: true, href: "/api/projects/example/budget/export?audience=partner&run=run-id" });
  expect(attributes).not.toHaveProperty("target");
});

it("opens authenticated previews inline while preserving invoice versions and PDF destinations", () => {
  expect(fileLinkAttributes("/api/invoices/invoice-id?version=file-id#page=2", "preview")).toEqual({
    href: "/api/invoices/invoice-id?version=file-id&inline=1#page=2", target: "_blank", rel: "noopener noreferrer",
  });
  expect(fileLinkAttributes("/api/files/file-id/download", "preview").href).toBe("/api/files/file-id/download?inline=1");
});

it("preserves external document links without rewriting provider URLs", () => {
  expect(fileLinkAttributes("https://documents.example/file?signature=example", "preview").href)
    .toBe("https://documents.example/file?signature=example");
});
