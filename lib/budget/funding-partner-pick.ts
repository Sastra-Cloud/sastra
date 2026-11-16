/**
 * Works out who funds a project from its signed agreement, for projects whose
 * Budget has no partner saved yet. Pure, so the page and invoice generation
 * agree on one answer. Saving the result is a separate, explicit step.
 */

export type FundingPartnerFields = {
  partnerName: string;
  partnerContactFirstName: string | null;
  partnerContactLastName: string | null;
  partnerContactEmail: string | null;
  /** Free-text contact note; the agreement contact's phone when known. */
  partnerContact: string | null;
  partnerId: string | null;
  partnerContactId: string | null;
  billingAddress: string;
};

export type AgreementContact = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

/** The party named by a committed agreement import. */
export type ImportedParty = {
  partnerOrg: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  /**
   * This import created the project's expected payments, so the organization it
   * names is the one that promised the money.
   */
  scheduledPayments?: boolean;
};

export type SavedPartner = {
  id: string;
  name: string;
  billingAddress: string | null;
  contacts: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    isPrimary: boolean;
  }>;
};

const clean = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const sameText = (a: string | null, b: string | null) =>
  a !== null &&
  b !== null &&
  a.trim().replace(/\s+/g, " ").toLowerCase() ===
    b.trim().replace(/\s+/g, " ").toLowerCase();

/** Reads the party from a stored extraction of any age; older ones lack newer keys. */
export function importedParty(extraction: unknown): ImportedParty | null {
  if (!extraction || typeof extraction !== "object") return null;
  const data = extraction as Record<string, unknown>;
  const partnerOrg = clean(data.partnerOrg);
  if (!partnerOrg) return null;
  return {
    partnerOrg,
    contactName: clean(data.contactName),
    contactEmail: clean(data.contactEmail),
    contactPhone: clean(data.contactPhone),
  };
}

export function pickAgreementFundingPartner(input: {
  /** The MoU partner, or the license holder for a license that also funds the work. */
  holderName: string | null;
  holderContact: AgreementContact | null;
  /** Committed agreement imports for the project, newest first. */
  imports: ImportedParty[];
  savedPartners: SavedPartner[];
}): FundingPartnerFields | null {
  const holderName = clean(input.holderName);
  // The import that set up the expected payments names who pays. That beats the
  // rights holder, who can be a publisher we license from rather than the payer.
  // An import that scheduled nothing is never used on its own: its organization
  // may only be a rights holder.
  const payer = input.imports.find((party) => party.scheduledPayments && party.partnerOrg) ?? null;
  const partnerName = payer?.partnerOrg ?? holderName;
  if (!partnerName) return null;

  const fromImport = (party: ImportedParty): AgreementContact => ({
    name: party.contactName,
    email: party.contactEmail,
    phone: party.contactPhone,
  });
  // Contacts that speak for this partner, most trusted first. An import or
  // holder that names a different organization never lends its contact.
  const contacts: AgreementContact[] = [
    ...(payer ? [fromImport(payer)] : []),
    ...(input.holderContact && sameText(holderName, partnerName) ? [input.holderContact] : []),
    ...input.imports
      .filter((party) => party !== payer && sameText(party.partnerOrg, partnerName))
      .map(fromImport),
  ];
  const contact =
    contacts.find((candidate) => clean(candidate.email)) ??
    contacts.find((candidate) => clean(candidate.name)) ??
    null;

  const saved =
    input.savedPartners.find((partner) => sameText(partner.name, partnerName)) ?? null;
  const contactEmail = clean(contact?.email);
  const savedContact = contactEmail
    ? saved?.contacts.find((candidate) => sameText(candidate.email, contactEmail)) ?? null
    : contact
      ? null
      : saved?.contacts.find((candidate) => candidate.isPrimary) ?? saved?.contacts[0] ?? null;
  const nameParts = (clean(contact?.name) ?? "").split(/\s+/).filter(Boolean);

  return {
    partnerName,
    partnerContactFirstName: savedContact?.firstName ?? nameParts[0] ?? null,
    partnerContactLastName:
      savedContact?.lastName ??
      (nameParts.length > 1 ? nameParts.slice(1).join(" ") : null),
    partnerContactEmail: clean(savedContact?.email) ?? contactEmail,
    partnerContact: clean(contact?.phone),
    partnerId: saved?.id ?? null,
    partnerContactId: savedContact?.id ?? null,
    billingAddress: clean(saved?.billingAddress) ?? "",
  };
}
