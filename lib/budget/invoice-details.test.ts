import { beforeEach, expect, it, vi } from "vitest";
const { rows } = vi.hoisted(() => ({ rows: new Map<string, unknown[]>() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
 const { getTableName } = await import("drizzle-orm");
 return { db: { select: () => ({ from: (table: Parameters<typeof getTableName>[0]) => {
   const values = () => rows.get(getTableName(table)) ?? [];
   const query = { innerJoin: () => query, where: () => query, limit: async () => values(), then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(values()).then(resolve) };
   return query;
 } }) } };
});
import { getMouInvoiceDetails } from "./invoice-details";
beforeEach(() => {
 rows.clear();
 rows.set("project_budget_settings", [{ partnerName: "Unrelated anchor partner", partnerId: "other" }]);
 rows.set("projects", [{ title: "Internal title" }]);
 rows.set("shared_mou_groups", [{ id: "group", name: "MoU", counterparty: "Funding organization", contactName: "Primary contact", sourceImportId: "source" }]);
 rows.set("partners", [{ name: "Funding organization", billingAddress: "Partner address" }]);
 rows.set("shared_mou_memberships", [{ projectId: "video", title: "Internal video title" }, { projectId: "articles", title: "Internal articles title" }]);
 rows.set("document_imports", [{ fundingSourceKey: "fingerprint", committedProjectIds: ["articles", "video"], extraction: { projects: [{ title: "52 translations with audio" }, { title: "52 talking-head videos" }] } }]);
});
it("uses the counterparty and saved address and maps source titles by project identity", async () => {
 const result = await getMouInvoiceDetails({ projectId: "articles", sharedMouGroupId: "group", trigger: "on_signing" });
 expect(result.recipientName).toBe("Funding organization");
 expect(result.billingAddress).toBe("Partner address");
 expect(result.description).toContain("52 translations with audio");
 expect(result.description).toContain("52 talking-head videos");
 expect(result.description).not.toContain("Internal");
 expect(result.recipientName).not.toContain("Primary contact");
});
it("does not choose an address when counterparties are ambiguous", async () => {
 rows.set("partners", [{ billingAddress: "A" }, { billingAddress: "B" }]);
 expect((await getMouInvoiceDetails({ projectId: "articles", sharedMouGroupId: "group", trigger: "on_signing" })).billingAddress).toBe("");
});
it("falls back to current project titles for work added after source approval", async () => {
 rows.set("shared_mou_memberships", [{ projectId: "new", title: "New covered work" }]);
 expect((await getMouInvoiceDetails({ projectId: "articles", sharedMouGroupId: "group", trigger: "on_completion" })).description).toContain("New covered work");
});
