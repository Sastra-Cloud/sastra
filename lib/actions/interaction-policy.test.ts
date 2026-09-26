import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { interactionModeFor } from "./interaction-policy";

function clientActionImports() {
  const found: string[] = [];

  function walk(directory: string) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(file);
        continue;
      }
      if (!entry.name.endsWith(".tsx")) continue;

      const source = fs.readFileSync(file, "utf8");
      if (!/^["']use client["']/.test(source)) continue;
      const parsed = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );

      for (const statement of parsed.statements) {
        if (!ts.isImportDeclaration(statement)) continue;
        if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const moduleName = statement.moduleSpecifier.text;
        if (!moduleName.startsWith("@/lib/") && !moduleName.startsWith("@/app/")) {
          continue;
        }
        if (
          !/(?:actions|action)$/.test(moduleName) &&
          !moduleName.endsWith("/push/client") &&
          !moduleName.includes("/upload-client")
        ) {
          continue;
        }
        const clause = statement.importClause;
        if (!clause || clause.isTypeOnly) continue;
        const bindings = clause.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) continue;
        for (const specifier of bindings.elements) {
          if (!specifier.isTypeOnly) found.push(specifier.name.text);
        }
      }
    }
  }

  walk(path.join(process.cwd(), "components"));
  walk(path.join(process.cwd(), "app"));
  return [...new Set(found)].sort();
}

describe("client action interaction policy", () => {
  it("classifies every client-invoked action", () => {
    const unclassified = clientActionImports().filter(
      (action) => interactionModeFor(action) === "unclassified"
    );
    expect(unclassified).toEqual([]);
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
    expect(interactionModeFor("deleteTask")).toBe("confirmed-destructive");
    expect(interactionModeFor("sendMouProposal")).toBe("progress");
    expect(interactionModeFor("approveFundingReview")).toBe("progress");
    expect(interactionModeFor("confirmSharedMouDelivery")).toBe("progress");
    expect(interactionModeFor("sendInvoiceEmail")).toBe("progress");
    expect(interactionModeFor("generateMouInvoice")).toBe("progress");
    expect(interactionModeFor("sendPrintRfq")).toBe("progress");
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
    expect(interactionModeFor("setProfileImage")).toBe("progress");
    expect(interactionModeFor("updateVideoProductionMode")).toBe("progress");
  });

  it("treats channel creation as navigation", () => {
    expect(interactionModeFor("createChannel")).toBe("navigation");
    expect(interactionModeFor("openDirectMessage")).toBe("navigation");
  });

  it("keeps channel membership changes immediate and permission-safe", () => {
    expect(interactionModeFor("addChannelMember")).toBe("optimistic");
    expect(interactionModeFor("removeChannelMember")).toBe(
      "confirmed-destructive"
    );
  });

  it("classifies the push device actions", () => {
    // External delivery — pending label, never assume success.
    expect(interactionModeFor("sendTestPush")).toBe("progress");
    // Forgetting a device is destructive — confirm first.
    expect(interactionModeFor("removePushDevice")).toBe("confirmed-destructive");
  });

  it("keeps the AI key save progress-based and its removal confirmed", () => {
    expect(interactionModeFor("updateOpenRouterApiKey")).toBe("progress");
    expect(interactionModeFor("removeOpenRouterApiKey")).toBe("confirmed-destructive");
  });

  it("keeps manually requested dependency audits progress-based", () => {
    expect(interactionModeFor("runDependencySecurityCheck")).toBe("progress");
  });

  it("keeps notification email settings optimistic", () => {
    expect(interactionModeFor("setEmailPreference")).toBe("optimistic");
    expect(interactionModeFor("updateEmailDeliverySettings")).toBe("optimistic");
  });

  it("keeps the guidance preference toggle optimistic", () => {
    // Reversible per-user preference — flip immediately, roll back on error.
    expect(interactionModeFor("setGuidanceLevel")).toBe("optimistic");
    expect(interactionModeFor("dismissGuidanceKey")).toBe("optimistic");
    expect(interactionModeFor("restoreGuidanceKey")).toBe("optimistic");
  });

  it("keeps project lifecycle changes optimistic", () => {
    expect(interactionModeFor("updateProjectStatus")).toBe("optimistic");
    expect(interactionModeFor("updateProjectTitle")).toBe("optimistic");
  });

  it("classifies the correspondence project actions", () => {
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

  it("keeps already-completed email suggestions immediate and reversible", () => {
    expect(interactionModeFor("markEmailTaskSuggestionAlreadyDone")).toBe(
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

  it("classifies unpaid payment schedule edits as optimistic", () => {
    expect(interactionModeFor("updatePayment")).toBe("optimistic");
  });

  it("classifies attachment note edits as optimistic", () => {
    expect(interactionModeFor("updateAttachmentNotes")).toBe("optimistic");
  });

  it("classifies print funding status updates as optimistic", () => {
    expect(interactionModeFor("updateProjectPrintFunding")).toBe("optimistic");
  });

  it("keeps budget line feedback immediate and reversible", () => {
    expect(interactionModeFor("addCustomLine")).toBe("optimistic");
    expect(interactionModeFor("addAcceptedPrintQuoteBudgetLine")).toBe(
      "optimistic"
    );
    expect(interactionModeFor("updateBudgetLine")).toBe("optimistic");
    expect(interactionModeFor("deleteBudgetLine")).toBe(
      "confirmed-destructive"
    );
  });

  it("keeps project print and quotation settings immediate and reversible", () => {
    expect(interactionModeFor("updateBudgetSettings")).toBe("optimistic");
    expect(interactionModeFor("updatePrintSettings")).toBe("optimistic");
  });

  it("classifies partner quotations, receipts, and immutable invoices", () => {
    expect(interactionModeFor("saveBudgetPresentation")).toBe("optimistic");
    expect(interactionModeFor("enableBudgetPresentation")).toBe("progress");
    expect(interactionModeFor("applySuggestedPartnerRates")).toBe("optimistic");
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

  it("keeps email draft persistence truthful and discard confirmed", () => {
    expect(interactionModeFor("saveEmailDraft")).toBe("progress");
    expect(interactionModeFor("discardEmailDraft")).toBe(
      "confirmed-destructive"
    );
  });

  it("classifies wiki authoring feedback", () => {
    expect(interactionModeFor("updateWikiPageDraft")).toBe("optimistic");
    expect(interactionModeFor("reorderWikiPages")).toBe("optimistic");
    expect(interactionModeFor("publishWikiPage")).toBe("progress");
    expect(interactionModeFor("trashWikiPage")).toBe("confirmed-destructive");
    expect(interactionModeFor("restoreWikiPage")).toBe("optimistic");
  });

  it("classifies the email-intake learning actions", () => {
    // Approving/rejecting/retiring a learned negative rule is reversible.
    expect(interactionModeFor("approveEmailSignalLesson")).toBe("optimistic");
    expect(interactionModeFor("rejectEmailSignalLesson")).toBe("optimistic");
    expect(interactionModeFor("retireEmailSignalLesson")).toBe("optimistic");
    // Running the reflection pass is long-running AI work — show progress.
    expect(interactionModeFor("runEmailSignalReflectionNow")).toBe("progress");
  });

  it("classifies chat message pins as optimistic, not destructive", () => {
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
