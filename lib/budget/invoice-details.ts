import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentImports, partners, projectBudgetSettings, projects, sharedMouGroups, sharedMouMemberships } from "@/lib/db/schema";
import { describeInvoiceWork } from "./invoice-description";

export async function getMouInvoiceDetails(input: { projectId: string; sharedMouGroupId: string | null; trigger: string; publicDescription?: string | null }) {
  const [[budget], [project], groups] = await Promise.all([
    db.select().from(projectBudgetSettings).where(eq(projectBudgetSettings.projectId, input.projectId)).limit(1),
    db.select({ title: projects.title }).from(projects).where(eq(projects.id, input.projectId)).limit(1),
    input.sharedMouGroupId ? db.select().from(sharedMouGroups).where(eq(sharedMouGroups.id, input.sharedMouGroupId)).limit(1) : Promise.resolve([]),
  ]);
  const group = groups[0];
  const name = group ? group.counterparty?.trim() || null : budget?.partnerName?.trim() || null;
  // Shared agreements match their counterparty, never an unrelated anchor project's partner.
  const matches = !group && budget?.partnerId
    ? await db.select().from(partners).where(eq(partners.id, budget.partnerId)).limit(1)
    : name ? await db.select().from(partners).where(sql`lower(trim(${partners.name})) = lower(trim(${name}))`).limit(2) : [];
  const partner = matches.length === 1 ? matches[0] : null;
  const members = group ? await db.select({ projectId: projects.id, title: projects.title }).from(sharedMouMemberships)
    .innerJoin(projects, eq(projects.id, sharedMouMemberships.projectId))
    .where(and(eq(sharedMouMemberships.groupId, group.id), eq(sharedMouMemberships.active, true))) : [];
  const [source] = group?.sourceImportId ? await db.select().from(documentImports).where(eq(documentImports.id, group.sourceImportId)).limit(1) : [];
  const extraction = source?.reviewed ?? source?.extraction;
  const works = members.length ? members.map((member) => {
    const index = source?.fundingSourceKey ? source.committedProjectIds?.indexOf(member.projectId) ?? -1 : -1;
    return index >= 0 ? extraction?.projects[index]?.title || member.title : member.title;
  }) : [project?.title ?? "Project funding"];
  return {
    recipientName: group ? name : partner?.name || name,
    billingAddress: partner?.billingAddress ?? "",
    description: describeInvoiceWork({ trigger: input.trigger, agreement: group?.name || "the MoU", works, fallback: input.publicDescription }),
  };
}
