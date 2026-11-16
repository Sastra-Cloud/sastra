import { describe, expect, it } from "vitest";

import { importedParty, pickAgreementFundingPartner } from "./funding-partner-pick";

const saved = [{
  id: "partner-1", name: "Example Foundation", billingAddress: "1 Main Street",
  contacts: [
    { id: "contact-primary", firstName: "Dara", lastName: "Sok", email: "dara@example.org", isPrimary: true },
    { id: "contact-2", firstName: "Maly", lastName: "Chan", email: "maly@example.org", isPrimary: false },
  ],
}];

describe("pickAgreementFundingPartner", () => {
  it("fills a holder with no contact from the agreement import that names the same partner", () => {
    // A license that also funds the work: the holder is known, its contact is not.
    const result = pickAgreementFundingPartner({
      holderName: "Example Foundation",
      holderContact: null,
      imports: [{ partnerOrg: " example  foundation ", contactName: "Maly Chan", contactEmail: "MALY@example.org", contactPhone: "012 345 678" }],
      savedPartners: saved,
    });
    expect(result).toMatchObject({
      partnerName: "Example Foundation", partnerContactEmail: "maly@example.org",
      partnerContactFirstName: "Maly", partnerContactLastName: "Chan", partnerContact: "012 345 678",
      partnerId: "partner-1", partnerContactId: "contact-2", billingAddress: "1 Main Street",
    });
  });

  it("never borrows a contact from an import about a different organization", () => {
    const result = pickAgreementFundingPartner({
      holderName: "Example Foundation",
      holderContact: null,
      imports: [{ partnerOrg: "Another Publisher", contactName: "Wrong Person", contactEmail: "wrong@example.com", contactPhone: null }],
      savedPartners: [],
    });
    expect(result).toMatchObject({ partnerName: "Example Foundation", partnerContactEmail: null, partnerContactFirstName: null, partnerId: null });
  });

  it("prefers the agreement's own contact email over the import", () => {
    const result = pickAgreementFundingPartner({
      holderName: "Example Foundation",
      holderContact: { name: "Dara Sok", email: "dara@example.org", phone: null },
      imports: [{ partnerOrg: "Example Foundation", contactName: "Maly Chan", contactEmail: "maly@example.org", contactPhone: null }],
      savedPartners: saved,
    });
    expect(result).toMatchObject({ partnerContactEmail: "dara@example.org", partnerContactId: "contact-primary" });
  });

  it("bills the organization whose agreement set up the payments, not a different rights holder", () => {
    // The license holder is a publisher; the import that scheduled the payments names the payer.
    const result = pickAgreementFundingPartner({
      holderName: "Publisher We License From",
      holderContact: { name: "Rights Desk", email: "rights@publisher.example", phone: null },
      imports: [{ partnerOrg: "Example Foundation", contactName: "Maly Chan", contactEmail: "maly@example.org", contactPhone: null, scheduledPayments: true }],
      savedPartners: saved,
    });
    expect(result).toMatchObject({ partnerName: "Example Foundation", partnerContactEmail: "maly@example.org", partnerId: "partner-1", partnerContactId: "contact-2" });
  });

  it("does not treat an import that scheduled no payments as the payer", () => {
    // Without a rights holder, such an import may only name a publisher we pay.
    expect(pickAgreementFundingPartner({
      holderName: null, holderContact: null,
      imports: [{ partnerOrg: "Publisher We License From", contactName: null, contactEmail: "rights@publisher.example", contactPhone: null, scheduledPayments: false }],
      savedPartners: [],
    })).toBeNull();
  });

  it("returns nothing when no agreement names a partner", () => {
    expect(pickAgreementFundingPartner({ holderName: null, holderContact: null, imports: [], savedPartners: saved })).toBeNull();
  });
});

describe("importedParty", () => {
  it("reads an older extraction that lacks newer fields", () => {
    expect(importedParty({ partnerOrg: "Example Foundation", contactEmail: " maly@example.org ", agreementType: "license_only", projects: [] }))
      .toEqual({ partnerOrg: "Example Foundation", contactName: null, contactEmail: "maly@example.org", contactPhone: null });
    expect(importedParty({ partnerOrg: "  " })).toBeNull();
    expect(importedParty(null)).toBeNull();
  });
});
