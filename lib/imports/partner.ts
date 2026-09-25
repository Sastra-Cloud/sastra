import type { ImportExtraction } from "@/lib/imports/types";

/** Whether the agreement promises money coming to us. */
export function hasInboundAgreementFunding(data: ImportExtraction): boolean {
  return (
    data.mouPaymentSchedule.length > 0 ||
    (data.agreementTotalAmount != null && data.agreementTotalAmount > 0)
  );
}

export function budgetPartnerFromExtraction(data: ImportExtraction): {
  partnerName: string | null;
  partnerContactFirstName: string | null;
  partnerContactLastName: string | null;
  partnerContactEmail: string | null;
  partnerContact: string | null;
} {
  if (
    data.agreementType === "license_only" &&
    !hasInboundAgreementFunding(data)
  ) {
    return {
      partnerName: null,
      partnerContactFirstName: null,
      partnerContactLastName: null,
      partnerContactEmail: null,
      partnerContact: null,
    };
  }

  const nameParts = (data.contactName?.trim() ?? "")
    .split(/\s+/)
    .filter(Boolean);
  return {
    partnerName: data.partnerOrg?.trim() || null,
    partnerContactFirstName: nameParts[0] || null,
    partnerContactLastName:
      nameParts.length > 1 ? nameParts.slice(1).join(" ") : null,
    partnerContactEmail: data.contactEmail?.trim() || null,
    partnerContact: data.contactPhone?.trim() || null,
  };
}
