"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Handshake, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { thrownMutationMessage } from "@/lib/actions/result";
import { saveAgreementFundingPartner } from "@/lib/budget/funding-partner-actions";
import { cn } from "@/lib/utils";

export type FundingPartnerSummary = {
  /** Saved on Budget, read from the signed agreement, or not known. */
  source: "saved" | "agreement" | "none";
  name: string | null;
  contactName: string | null;
  email: string | null;
};

/**
 * Says who this project's invoices and proposals go to, and what to do when
 * that is not known yet. The partner editor itself stays on the Quotation tab.
 */
export function FundingPartnerNotice({
  projectId,
  partner,
  /** Where the notice sits: invoices need a partner, proposals only use one. */
  purpose,
}: {
  projectId: string;
  partner: FundingPartnerSummary;
  purpose: "invoices" | "proposals";
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const details = [partner.contactName, partner.email].filter(Boolean).join(" · ");
  const editLink = (label: string, primary = false) => (
    <a
      href="#funding-partner"
      className={buttonVariants({ variant: primary ? "default" : "outline", size: "sm" })}
    >
      {label}
    </a>
  );

  function save() {
    startSaving(async () => {
      try {
        const result = await saveAgreementFundingPartner(projectId);
        if (!result.ok) {
          toast.error(result.error.message);
          return;
        }
        toast.success(`${result.data?.partnerName ?? "Partner"} saved as the funding partner.`);
        router.refresh();
      } catch (error) {
        toast.error(thrownMutationMessage(error, "Could not save the partner. Try again."));
      }
    });
  }

  if (partner.source === "none") {
    return (
      <div
        role="status"
        className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
      >
        <span className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-text" />
          <span>
            <span className="block font-medium">No funding partner yet</span>
            <span className="block text-muted-foreground">
              {purpose === "invoices"
                ? "Add the partner before you create an invoice. The invoice then shows who it is for, and the email is addressed for you."
                : "Add the partner who funds this project. Proposals and invoices are then addressed for you."}
            </span>
          </span>
        </span>
        {editLink("Add funding partner", true)}
      </div>
    );
  }

  const fromAgreement = partner.source === "agreement";
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
        fromAgreement ? "border-info/30 bg-info/5" : "bg-card"
      )}
    >
      <span className="flex min-w-0 items-start gap-2">
        <Handshake className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block wrap-anywhere">
            <span className="text-muted-foreground">Funding partner: </span>
            <span className="font-medium">{partner.name}</span>
            {details ? <span className="text-muted-foreground"> · {details}</span> : null}
          </span>
          <span className="block text-muted-foreground">
            {fromAgreement
              ? "Taken from the signed agreement. Save it to use it for proposals and invoices."
              : purpose === "invoices"
                ? "Invoices are billed to this partner."
                : "Proposals and invoices go to this partner."}
            {partner.email ? "" : " Add an email so invoice emails are addressed for you."}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-2">
        {fromAgreement ? (
          <Button type="button" size="sm" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {saving ? "Saving partner…" : "Save as funding partner"}
          </Button>
        ) : null}
        {editLink(fromAgreement ? "Edit partner" : partner.email ? "Change partner" : "Add email")}
      </span>
    </div>
  );
}
