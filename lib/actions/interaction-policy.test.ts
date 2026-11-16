import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { scanClientActions } from "./client-action-discovery";
import { interactionModeFor } from "./interaction-policy";

it("keeps project permission grants immediate after confirmation and removal confirmed", () => {
  expect(interactionModeFor("addProjectManager")).toBe("optimistic");
  expect(interactionModeFor("removeProjectManager")).toBe("confirmed-destructive");
});

it("keeps cross-app identity and ownership changes review-first", () => {
  expect(interactionModeFor("findLectioProjectMatches")).toBe("read");
  expect(interactionModeFor("createLectioProjectForReview")).toBe("progress");
  expect(interactionModeFor("confirmLectioLink")).toBe("progress");
  expect(interactionModeFor("reapproveLectioConnection")).toBe("progress");
  expect(interactionModeFor("removeLectioPerson")).toBe("confirmed-destructive");
  expect(interactionModeFor("unlinkLectioSignIn")).toBe("confirmed-destructive");
});

describe("client action interaction policy", () => {
  it("shows directory partner creation immediately with rollback", () => {
    expect(interactionModeFor("createPartner")).toBe("optimistic");
  });
  it("keeps AI print estimate intake progress-based until suggestions are saved", () => {
    expect(interactionModeFor("createPrintEstimateFromText")).toBe("progress");
  });
  it("keeps personal task pins immediate without destructive confirmation", () => {
    expect(interactionModeFor("getTaskPinSnapshot")).toBe("read");
    expect(interactionModeFor("setTaskPinned")).toBe("optimistic");
  });
  it("keeps partner answers and proposal links immediate with rollback", () => {
    expect(interactionModeFor("setProposalAnswer")).toBe("optimistic");
    expect(interactionModeFor("linkReceiptToProposal")).toBe("optimistic");
  });
  it("keeps gesture and picker reactions optimistic, with truthful clipboard feedback", () => {
    expect(interactionModeFor("toggleReaction")).toBe("optimistic");
    expect(interactionModeFor("editMessage")).toBe("optimistic");
    expect(interactionModeFor("copyMessageText")).toBe("progress");
  });
  it("keeps chat messages and quoted replies optimistic, and picked, pasted, or dropped uploads progress-based", () => {
    expect(interactionModeFor("postMessage")).toBe("optimistic");
    expect(interactionModeFor("uploadToMessage")).toBe("progress");
    expect(interactionModeFor("prepareChatVideo")).toBe("progress");
  });
  it("keeps reviewed printer-payment confirmation immediate with rollback", () => {
    expect(interactionModeFor("markPrintPaymentPaid")).toBe("optimistic");
  });
  it('keeps support submissions and attachments progress-based', () => {
    expect(interactionModeFor("downloadSupportAttachment")).toBe("progress");
    expect(interactionModeFor("updateSupportEmailPreference")).toBe("optimistic");
    expect(interactionModeFor('submitSupportRequest')).toBe('progress');
    expect(interactionModeFor('sendSupportReply')).toBe('progress');
    expect(interactionModeFor('uploadSupportAttachment')).toBe('progress');
    expect(interactionModeFor('setSupportEmailPreference')).toBe('optimistic');
  });
  it("keeps sponsorship finances reviewed and drafts immediate", () => {
    expect(interactionModeFor("setWorkspaceModule")).toBe("optimistic");
    expect(interactionModeFor("createSponsorship")).toBe("navigation");
    expect(interactionModeFor("updateSponsorship")).toBe("optimistic");
    expect(interactionModeFor("generateSponsorshipInvoice")).toBe("progress");
    expect(interactionModeFor("recordSponsorshipReceipt")).toBe("progress");
    expect(interactionModeFor("recordSponsorshipFundUse")).toBe("progress");
    expect(interactionModeFor("reverseSponsorshipReceipt")).toBe("progress");
    expect(interactionModeFor("reverseSponsorshipFundUse")).toBe("progress");
    expect(interactionModeFor("cancelSponsorship")).toBe("confirmed-destructive");
    expect(interactionModeFor("voidSponsorshipInvoice")).toBe("confirmed-destructive");
  });
  it("classifies every client-invoked action", () => {
    const { actions, diagnostics } = scanClientActions();
    expect(diagnostics).toEqual([]);
    expect(
      actions.filter((action) => interactionModeFor(action) === "unclassified")
    ).toEqual([]);
  }, 15_000);

  it("keeps durable mutations on the shared optimistic patterns", () => {
    const offenders: string[] = [];
    for (const root of ["components", "app", "hooks"]) {
      const visit = (directory: string) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const file = path.join(directory, entry.name);
          if (entry.isDirectory()) {
            visit(file);
          } else if (/\.[jt]sx?$/.test(entry.name)) {
            const source = fs.readFileSync(file, "utf8");
            if (/\buseOptimistic\b/.test(source)) offenders.push(file);
          }
        }
      };
      visit(path.join(process.cwd(), root));
    }
    expect(offenders).toEqual([]);
  });

  it("keeps irreversible and long-running work out of optimistic completion", () => {
    expect(interactionModeFor("createBudgetLineInvoice")).toBe("progress");
    expect(interactionModeFor("previewBudgetLineInvoice")).toBe("progress");
    expect(interactionModeFor("deleteTask")).toBe("confirmed-destructive");
    expect(interactionModeFor("sendMouProposal")).toBe("progress");
    expect(interactionModeFor("draftMouProposal")).toBe("progress");
    expect(interactionModeFor("approveFundingReview")).toBe("progress");
    expect(interactionModeFor("confirmSharedMouDelivery")).toBe("progress");
    expect(interactionModeFor("sendInvoiceEmail")).toBe("progress");
    expect(interactionModeFor("generateMouInvoice")).toBe("progress");
    expect(interactionModeFor("sendPrintRfq")).toBe("progress");
    expect(interactionModeFor("draftPrintEstimate")).toBe("progress");
    expect(interactionModeFor("selectPrintEstimateQuote")).toBe("progress");
    expect(interactionModeFor("stopUsingPrintEstimateQuote")).toBe("progress");
    expect(interactionModeFor("sendWireRequest")).toBe("progress");
    expect(interactionModeFor("consolidatePrintInvoicePayment")).toBe("progress");
    expect(interactionModeFor("reviewPrintWirePayment")).toBe("read");
    expect(interactionModeFor("sendThreadReply")).toBe("progress");
    expect(interactionModeFor("updateTaskStatus")).toBe("optimistic");
    expect(interactionModeFor("createTask")).toBe("optimistic");
    expect(interactionModeFor("bulkCreateEpisodes")).toBe("progress");
    expect(interactionModeFor("bulkUpdateEpisodes")).toBe("progress");
    expect(interactionModeFor("approveAssistantAction")).toBe("progress");
    expect(interactionModeFor("initiateRightsStep")).toBe("progress");
    expect(interactionModeFor("createRecurringTask")).toBe("progress");
    expect(interactionModeFor("createPrintRun")).toBe("progress");
    expect(interactionModeFor("createGuidedBudget")).toBe("progress");
    expect(interactionModeFor("setProfileImage")).toBe("progress");
    expect(interactionModeFor("updateVideoProductionMode")).toBe("progress");
  });

  it("treats channel creation as navigation", () => {
    expect(interactionModeFor("createChannel")).toBe("navigation");
    expect(interactionModeFor("reloadForAppUpdate")).toBe("navigation");
    expect(interactionModeFor("openDirectMessage")).toBe("navigation");
  });

  it("classifies the push device actions", () => {
    // Browser/OS permission and subscription work need truthful pending UI.
    expect(interactionModeFor("enablePush")).toBe("progress");
    expect(interactionModeFor("disablePush")).toBe("progress");
    expect(interactionModeFor("promptInstall")).toBe("progress");
    // External delivery — pending label, never assume success.
    expect(interactionModeFor("sendTestPush")).toBe("progress");
    // Forgetting a device is destructive — confirm first.
    expect(interactionModeFor("removePushDevice")).toBe("confirmed-destructive");
  });

  it("keeps the AI key save progress-based and its removal confirmed", () => {
    expect(interactionModeFor("updateOpenRouterApiKey")).toBe("progress");
    expect(interactionModeFor("removeOpenRouterApiKey")).toBe("confirmed-destructive");
  });

  it("keeps project lifecycle changes optimistic", () => {
    expect(interactionModeFor("createProposalBudget")).toBe("navigation");
    expect(interactionModeFor("updateProjectStatus")).toBe("optimistic");
    expect(interactionModeFor("updateProjectTitle")).toBe("optimistic");
  });

  it("classifies the correspondence project actions", () => {
    expect(interactionModeFor("dismissEmailQuoteSuggestion")).toBe("optimistic");
    expect(interactionModeFor("dismissEmailFundingReview")).toBe("optimistic");
    // Bulk, server-computed create — show real progress, don't fake completion.
    expect(interactionModeFor("createProjectsFromThread")).toBe("progress");
    // Single create + link from the picker stays optimistic.
    expect(interactionModeFor("createProjectFromThread")).toBe("optimistic");
    // Linking/unlinking a project and dismissing a suggestion are reversible.
    expect(interactionModeFor("linkThreadProject")).toBe("optimistic");
    expect(interactionModeFor("unlinkThreadProject")).toBe("optimistic");
    expect(interactionModeFor("dismissProjectSuggestion")).toBe("optimistic");
    // Reprocessing can run external AI and extraction work, so completion is real.
    expect(interactionModeFor("reprocessMessage")).toBe("progress");
    expect(interactionModeFor("acceptEmailProjectUpdateSuggestion")).toBe(
      "progress"
    );
    expect(interactionModeFor("dismissEmailProjectUpdateSuggestion")).toBe(
      "optimistic"
    );
  });

  it("keeps invoice extraction and receipt recording progress-based", () => {
    expect(interactionModeFor("createImportForPaymentInvoice")).toBe("progress");
    expect(interactionModeFor("applyImportedInvoice")).toBe("progress");
  });

  it("keeps email rights documents review-first", () => {
    expect(interactionModeFor("approveEmailRightsReview")).toBe("progress");
    expect(interactionModeFor("retryEmailRightsReview")).toBe("progress");
    expect(interactionModeFor("dismissEmailRightsReview")).toBe("optimistic");
  });

  it("keeps budget line edits and partner visibility immediate and reversible", () => {
    expect(interactionModeFor("addCustomLine")).toBe("optimistic");
    expect(interactionModeFor("addAcceptedPrintQuoteBudgetLine")).toBe(
      "optimistic"
    );
    expect(interactionModeFor("updateBudgetLine")).toBe("optimistic");
    expect(interactionModeFor("deleteBudgetLine")).toBe(
      "confirmed-destructive"
    );
  });

  it("keeps print defaults immediate and waits for funding-partner invoice refreshes", () => {
    expect(interactionModeFor("updateBudgetSettings")).toBe("progress");
    expect(interactionModeFor("updatePrintSettings")).toBe("optimistic");
  });

  it("classifies partner quotations, receipts, and immutable invoices", () => {
    expect(interactionModeFor("saveBudgetPresentation")).toBe("optimistic");
    expect(interactionModeFor("savePartnerQuotation")).toBe("optimistic");
    expect(interactionModeFor("createBudgetApprovalRequest")).toBe("progress");
    expect(interactionModeFor("approveBudgetApprovalAssignment")).toBe("progress");
    expect(interactionModeFor("requestBudgetApprovalChanges")).toBe("progress");
    expect(interactionModeFor("deletePartnerQuotation")).toBe("confirmed-destructive");
    expect(interactionModeFor("savePartnerQuote")).toBe("optimistic");
    expect(interactionModeFor("enableBudgetPresentation")).toBe("progress");
    expect(interactionModeFor("applySuggestedPartnerRates")).toBe("optimistic");
    expect(interactionModeFor("undoSuggestedPartnerRates")).toBe("optimistic");
    expect(interactionModeFor("applySuggestedPerCopyPrice")).toBe("optimistic");
    expect(interactionModeFor("splitFundingIntoTwoPayments")).toBe("optimistic");
    expect(interactionModeFor("markPaymentPaid")).toBe("progress");
    expect(interactionModeFor("generateMouInvoice")).toBe("progress");
    expect(interactionModeFor("sendInvoiceEmail")).toBe("progress");
    expect(interactionModeFor("voidMouInvoice")).toBe(
      "confirmed-destructive"
    );
  });

  it("keeps donation imports and finance review progress-based", () => {
    expect(interactionModeFor("createDonationImportFromFile")).toBe("progress");
    expect(interactionModeFor("confirmDonationAllocations")).toBe("progress");
    expect(interactionModeFor("confirmDonationMouPaymentMatch")).toBe(
      "progress"
    );
    expect(interactionModeFor("setDonationUnallocated")).toBe("progress");
    expect(interactionModeFor("resolveDonationDuplicate")).toBe("progress");
    expect(interactionModeFor("resolveDonationDuplicates")).toBe("progress");
    expect(interactionModeFor("reopenDonationDuplicates")).toBe("progress");
    expect(interactionModeFor("setDonationsUnallocated")).toBe("progress");
  });

  it("previews new donation CSV formats and saves them with progress", () => {
    expect(interactionModeFor("getDonationCsvPreview")).toBe("read");
    expect(interactionModeFor("generateDonationCsvMapping")).toBe("progress");
    expect(interactionModeFor("learnDonationCsvFormat")).toBe("progress");
    expect(interactionModeFor("deleteDonationCsvFormat")).toBe(
      "confirmed-destructive"
    );
  });

  it("keeps admin assurance truthful and revocation confirmed", () => {
    expect(interactionModeFor("requestAdminSecurityCode")).toBe("progress");
    expect(interactionModeFor("verifyAdminSecurityCode")).toBe("progress");
    expect(interactionModeFor("revokeAllTrustedBrowsers")).toBe(
      "confirmed-destructive"
    );
  });

  it("keeps password recovery progress-based", () => {
    expect(interactionModeFor("requestPasswordReset")).toBe("progress");
    expect(interactionModeFor("resetPassword")).toBe("progress");
  });

  it("keeps Google authorization pending until the external consent flow", () => {
    expect(interactionModeFor("linkSocial")).toBe("progress");
  });

  it("keeps email draft persistence truthful and discard confirmed", () => {
    expect(interactionModeFor("saveEmailDraft")).toBe("progress");
    expect(interactionModeFor("discardEmailDraft")).toBe(
      "confirmed-destructive"
    );
  });

  it("keeps chat sends (including confirmed @channel alerts) and message menus optimistic", () => {
    expect(interactionModeFor("postMessage")).toBe("optimistic");
    expect(interactionModeFor("toggleReaction")).toBe("optimistic");
    expect(interactionModeFor("markChannelRead")).toBe("read");
    expect(interactionModeFor("uploadToMessage")).toBe("progress");
    expect(interactionModeFor("sendAssistantMessage")).toBe("progress");
    expect(interactionModeFor("clearAssistantThread")).toBe("confirmed-destructive");
    expect(interactionModeFor("pinMessage")).toBe("optimistic");
    // Unpinning is reversible (pin again), so it never asks for confirmation.
    expect(interactionModeFor("unpinMessage")).toBe("optimistic");
    // Deleting a message stays a confirmed delete; it also clears the pin.
    expect(interactionModeFor("deleteMessage")).toBe("confirmed-destructive");
  });

  it("classifies private agreement Q&A feedback", () => {
    expect(interactionModeFor("getAgreementChatSnapshot")).toBe("read");
    expect(interactionModeFor("sendAgreementQuestion")).toBe("progress");
    expect(interactionModeFor("clearAgreementChat")).toBe(
      "confirmed-destructive"
    );
    expect(interactionModeFor("retryAgreementIndex")).toBe("progress");
  });
});

it("restores personal guidance optimistically", () => { expect(interactionModeFor("resetGuidanceTips")).toBe("optimistic"); });

it("waits for canonical cross-app schedule writes while reads remain read-only", () => {
  expect(interactionModeFor("updateSchedule")).toBe("progress");
  expect(interactionModeFor("readSchedule")).toBe("read");
});
