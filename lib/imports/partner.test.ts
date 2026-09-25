import { describe, expect, it } from "vitest";

import {
  budgetPartnerFromExtraction,
  hasInboundAgreementFunding,
} from "@/lib/imports/partner";
import type { ImportExtraction } from "@/lib/imports/types";

const base: ImportExtraction = {
  documentKind: "agreement",
  invoice: null,
  agreementType: "mou_only",
  partnerOrg: "9Marks",
  contactName: "John Gim",
  contactEmail: "john@example.org",
  contactPhone: null,
  signedDate: null,
  documentTitle: null,
  agreementTotalAmount: null,
  mouPaymentSchedule: [],
  paymentProjectIndex: null,
  projects: [],
};

describe("budgetPartnerFromExtraction", () => {
  it("uses MoU partner data for budget sponsor fields", () => {
    expect(budgetPartnerFromExtraction(base)).toEqual({
      partnerName: "9Marks",
      partnerContactFirstName: "John",
      partnerContactLastName: "Gim",
      partnerContactEmail: "john@example.org",
      partnerContact: null,
    });
  });

  it("leaves budget sponsor fields blank for unfunded license-only imports", () => {
    expect(
      budgetPartnerFromExtraction({
        ...base,
        agreementType: "license_only",
        partnerOrg: "Union",
        contactName: "Rights Contact",
        contactEmail: "rights@example.org",
      })
    ).toEqual({
      partnerName: null,
      partnerContactFirstName: null,
      partnerContactLastName: null,
      partnerContactEmail: null,
      partnerContact: null,
    });
  });

  it("keeps contact names structured for MoU imports without email", () => {
    expect(
      budgetPartnerFromExtraction({
        ...base,
        contactEmail: null,
      })
    ).toEqual({
      partnerName: "9Marks",
      partnerContactFirstName: "John",
      partnerContactLastName: "Gim",
      partnerContactEmail: null,
      partnerContact: null,
    });
  });

  it("uses the payer as the funding partner for an inbound license", () => {
    const fundedLicense: ImportExtraction = {
      ...base,
      agreementType: "license_only",
      partnerOrg: "Ligonier Ministries",
      agreementTotalAmount: 10088,
      mouPaymentSchedule: [
        {
          trigger: "on_signing",
          amount: 5044,
          dueDate: null,
          notes: "Payment 1 of 2",
        },
      ],
    };

    expect(hasInboundAgreementFunding(fundedLicense)).toBe(true);
    expect(budgetPartnerFromExtraction(fundedLicense)).toMatchObject({
      partnerName: "Ligonier Ministries",
      partnerContactFirstName: "John",
      partnerContactLastName: "Gim",
      partnerContactEmail: "john@example.org",
    });
  });
});
