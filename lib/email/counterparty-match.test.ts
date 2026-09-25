import { describe, expect, it } from "vitest";

import { resolveFundingPartnerDirectoryMatch } from "./counterparty-match";

const organizations = [
  { id: "partner-1", name: "Desiring God Ministries" },
  { id: "partner-2", name: "Another Partner" },
];

const contacts = [
  {
    id: "contact-1",
    partnerId: "partner-1",
    email: "existing@desiringgod.org",
  },
];

describe("resolveFundingPartnerDirectoryMatch", () => {
  it("shows a new contact on an explicitly matched existing partner", () => {
    expect(
      resolveFundingPartnerDirectoryMatch(
        {
          name: "Desiring God",
          email: "joshua.larson@desiringgod.org",
          existingId: "partner-1",
        },
        organizations,
        contacts
      )
    ).toEqual({
      organizationId: "partner-1",
      organizationName: "Desiring God Ministries",
      contactId: null,
      organizationAction: "existing",
      contactAction: "create",
    });
  });

  it("reuses both the organization and contact when the email exists", () => {
    const result = resolveFundingPartnerDirectoryMatch(
      {
        name: "Different AI label",
        email: "EXISTING@desiringgod.org",
        existingId: null,
      },
      organizations,
      contacts
    );

    expect(result.organizationId).toBe("partner-1");
    expect(result.contactId).toBe("contact-1");
    expect(result.organizationAction).toBe("existing");
    expect(result.contactAction).toBe("existing");
  });

  it("uses normalized organization names for older pending suggestions", () => {
    const result = resolveFundingPartnerDirectoryMatch(
      {
        name: "Desiring-God Ministries",
        email: "new@desiringgod.org",
        existingId: null,
      },
      organizations,
      contacts
    );

    expect(result.organizationId).toBe("partner-1");
    expect(result.organizationAction).toBe("existing");
    expect(result.contactAction).toBe("create");
  });

  it("describes a new organization and contact when neither exists", () => {
    expect(
      resolveFundingPartnerDirectoryMatch(
        {
          name: "New Foundation",
          email: "person@new-foundation.org",
          existingId: null,
        },
        organizations,
        contacts
      )
    ).toMatchObject({
      organizationId: null,
      organizationName: "New Foundation",
      contactId: null,
      organizationAction: "create",
      contactAction: "create",
    });
  });
});
