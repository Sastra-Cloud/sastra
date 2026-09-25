import "server-only";

import { eq, or } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  rightsContacts,
  rightsHolders,
  rightsItems,
  partnerContacts,
  partners,
  projectBudgetSettings,
  projects,
  user,
} from "@/lib/db/schema";
import { matchKnownProject } from "@/lib/email/known-project-match";

/** The system-of-record links we can infer for a thread (any may be null). */
export type ThreadLink = {
  projectId: string | null;
  holderId: string | null;
  contactId: string | null;
  partnerId: string | null;
  partnerContactId: string | null;
};

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() || null : null;
}

/** Best-effort hostname from a stored website ("https://www.x.org" → "x.org"). */
function hostFromWebsite(website: string | null): string | null {
  if (!website) return null;
  try {
    const url = website.includes("://") ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Match an email address to an app user (case-insensitive). */
export async function attributeUserByEmail(
  email?: string | null
): Promise<string | null> {
  if (!email) return null;
  const target = email.toLowerCase();
  const rows = await db.select({ id: user.id, email: user.email }).from(user);
  return rows.find((u) => u.email?.toLowerCase() === target)?.id ?? null;
}

/**
 * Resolve which publisher/contact/project a thread concerns from its
 * participant addresses. Tables here are small (publishers + their contacts),
 * so we match in JS for case-insensitive / domain flexibility. A project link
 * is only set when the holder maps to exactly one project (else it's left for a
 * human to disambiguate in the inbox).
 */
export async function resolveThreadLink(
  participantEmails: string[],
  context: {
    subject?: string | null;
    bodyText?: string | null;
    includeQuotedHistory?: boolean;
  } = {}
): Promise<ThreadLink> {
  const emails = new Set(
    participantEmails.map((e) => e.toLowerCase()).filter(Boolean)
  );
  if (!emails.size) {
    return {
      projectId: null,
      holderId: null,
      contactId: null,
      partnerId: null,
      partnerContactId: null,
    };
  }

  // 1) direct contact match by email → contact + its holder
  const contacts = await db
    .select({
      id: rightsContacts.id,
      holderId: rightsContacts.holderId,
      email: rightsContacts.email,
    })
    .from(rightsContacts);
  const contact = contacts.find(
    (c) => c.email && emails.has(c.email.toLowerCase())
  );
  let holderId: string | null = contact?.holderId ?? null;
  const contactId: string | null = contact?.id ?? null;

  const fundingContacts = await db
    .select({
      id: partnerContacts.id,
      partnerId: partnerContacts.partnerId,
      email: partnerContacts.email,
    })
    .from(partnerContacts);
  const fundingContact = fundingContacts.find(
    (candidate) =>
      candidate.email && emails.has(candidate.email.toLowerCase())
  );
  let partnerId: string | null = fundingContact?.partnerId ?? null;
  const partnerContactId: string | null = fundingContact?.id ?? null;

  if (!partnerId) {
    const domains = new Set(
      [...emails].map(domainOf).filter((domain): domain is string => !!domain)
    );
    const fundingPartners = await db
      .select({ id: partners.id, website: partners.website })
      .from(partners);
    partnerId =
      fundingPartners.find((partner) => {
        const host = hostFromWebsite(partner.website);
        return host && domains.has(host);
      })?.id ?? null;
  }

  // 2) fall back to a holder whose website domain matches a sender domain
  if (!holderId) {
    const domains = new Set(
      [...emails].map(domainOf).filter((d): d is string => !!d)
    );
    if (domains.size) {
      const holders = await db
        .select({ id: rightsHolders.id, website: rightsHolders.website })
        .from(rightsHolders);
      holderId =
        holders.find((h) => {
          const host = hostFromWebsite(h.website);
          return host && domains.has(host);
        })?.id ?? null;
    }
  }

  // 3) project via a rights record that references this holder — only if unambiguous
  let projectId: string | null = null;
  if (holderId) {
    const items = await db
      .select({
        projectId: rightsItems.projectId,
        title: projects.title,
        slug: projects.slug,
      })
      .from(rightsItems)
      .innerJoin(projects, eq(projects.id, rightsItems.projectId))
      .where(
        or(
          eq(rightsItems.mouHolderId, holderId),
          eq(rightsItems.licenseHolderId, holderId),
          eq(rightsItems.copyrightHolderId, holderId)
        )
      );
    const distinct = [...new Set(items.map((i) => i.projectId))];
    if (distinct.length === 1) projectId = distinct[0];
    else if (distinct.length > 1) {
      projectId = await matchKnownProject({
        candidates: items
          .filter(
            (item, index) =>
              items.findIndex((other) => other.projectId === item.projectId) ===
              index
          )
          .map((item) => ({
            id: item.projectId,
            title: item.title,
            slug: item.slug,
          })),
        subject: context.subject,
        bodyText: context.bodyText,
        includeQuotedHistory: context.includeQuotedHistory,
        relationship: "rights_holder",
      });
    }
  }

  // A saved funding contact/partner is also a project relationship. Prefer the
  // exact contact when available; otherwise use every project tied to the
  // partner. One candidate is deterministic, while several are constrained to
  // those known projects and disambiguated from the current message.
  if (!projectId && partnerId) {
    const fundingProjects = await db
      .select({
        id: projects.id,
        title: projects.title,
        slug: projects.slug,
        partnerContactId: projectBudgetSettings.partnerContactId,
      })
      .from(projectBudgetSettings)
      .innerJoin(projects, eq(projects.id, projectBudgetSettings.projectId))
      .where(eq(projectBudgetSettings.partnerId, partnerId));
    const exactContactProjects = partnerContactId
      ? fundingProjects.filter(
          (project) => project.partnerContactId === partnerContactId
        )
      : [];
    const candidates = exactContactProjects.length
      ? exactContactProjects
      : fundingProjects;
    projectId = await matchKnownProject({
      candidates,
      subject: context.subject,
      bodyText: context.bodyText,
      includeQuotedHistory: context.includeQuotedHistory,
      relationship: "funding_partner",
    });
  }

  return { projectId, holderId, contactId, partnerId, partnerContactId };
}
