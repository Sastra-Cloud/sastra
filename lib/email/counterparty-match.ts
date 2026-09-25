import { normalizeIdentityName } from "@/lib/email/project-signal-policy";

type FundingPartnerRecord = {
  id: string;
  name: string;
};

type FundingPartnerContactRecord = {
  id: string;
  partnerId: string;
  email: string | null;
};

export type FundingPartnerDirectoryMatch = {
  organizationId: string | null;
  organizationName: string;
  contactId: string | null;
  organizationAction: "existing" | "create";
  contactAction: "existing" | "create" | "none";
};

/**
 * Resolves the action a funding-partner suggestion will take against the live
 * directory. A known contact email is strongest, followed by the stored match
 * and then a normalized organization-name match.
 */
export function resolveFundingPartnerDirectoryMatch(
  input: { name: string; email: string; existingId?: string | null },
  organizations: FundingPartnerRecord[],
  contacts: FundingPartnerContactRecord[]
): FundingPartnerDirectoryMatch {
  const email = input.email.trim().toLowerCase();
  const contactByEmail = email
    ? contacts.find((contact) => contact.email?.trim().toLowerCase() === email)
    : null;
  const organization =
    (contactByEmail
      ? organizations.find((row) => row.id === contactByEmail.partnerId)
      : null) ??
    (input.existingId
      ? organizations.find((row) => row.id === input.existingId)
      : null) ??
    organizations.find(
      (row) =>
        normalizeIdentityName(row.name) === normalizeIdentityName(input.name)
    ) ??
    null;
  const contact =
    organization && email
      ? contacts.find(
          (row) =>
            row.partnerId === organization.id &&
            row.email?.trim().toLowerCase() === email
        ) ?? null
      : null;

  return {
    organizationId: organization?.id ?? null,
    organizationName: organization?.name ?? input.name.trim(),
    contactId: contact?.id ?? null,
    organizationAction: organization ? "existing" : "create",
    contactAction: !email ? "none" : contact ? "existing" : "create",
  };
}
