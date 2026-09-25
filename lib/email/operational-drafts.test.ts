import { describe, expect, it } from "vitest";

import {
  buildExternalEmailDraftMessages,
  buildOperationalDraftSystemPrompt,
  establishedThreadClosing,
  fundingProposalFallback,
  printRfqFallback,
  wireRequestFallback,
} from "./operational-drafts";

const identity = {
  senderName: "Sokha Chan",
  organizationName: "Example Publishing",
};

describe("operational email drafts", () => {
  it("front-loads the funding amount, attachment, optional date, and next step", () => {
    const draft = fundingProposalFallback({
      ...identity,
      recipientFirstName: "Mara",
      projectTitle: "The Trinity",
      totalLabel: "$12,500",
      completionLabel: "Dec 15, 2026",
    });
    expect(draft.subject).toBe("Funding proposal: The Trinity");
    expect(draft.body.indexOf("$12,500")).toBeLessThan(draft.body.indexOf("attached quotation"));
    expect(draft.body).toContain("complete the work by Dec 15, 2026");
    expect(draft.body).toContain("prepare an MoU");
    expect(draft.body).toContain("Sokha Chan\nExample Publishing");
  });

  it("omits an unavailable proposal completion date", () => {
    const draft = fundingProposalFallback({
      ...identity,
      projectTitle: "The Trinity",
      totalLabel: "$12,500",
    });
    expect(draft.body).not.toContain("complet");
    expect(draft.body).not.toContain("undefined");
  });

  it("renders a compact RFQ list and asks for both price forms", () => {
    const pageCountLine = "Estimated target-language text pages: 180 (estimate for quote request; final page count pending after layout/proof).";
    const draft = printRfqFallback({
      ...identity,
      contactName: "Lina",
      projectTitle: "The Trinity",
      runTitle: "First edition",
      pageCountLine,
      trimSize: "5.5 x 8.5 in",
      coverPages: 4,
      quantities: [1000, 2000],
      textPaper: "70gsm offset",
      coverPaper: "250gsm matte",
      binding: "perfect bound",
      deliveryLocation: "Phnom Penh",
    });
    expect(draft.subject).toBe("Print quote request: The Trinity");
    expect(draft.body).toContain(`- ${pageCountLine}`);
    expect(draft.body).toContain("- Quantities: 1000, 2000 copies");
    expect(draft.body).toContain("total price and price per copy for every quantity");
    expect(draft.body).toContain("Sokha Chan\nExample Publishing");
  });

  it("builds a direct wire request and omits an unknown needed-by date", () => {
    const draft = wireRequestFallback({
      ...identity,
      amount: "$4,200",
      projectTitle: "The Trinity",
      payee: "Example Print Co",
      paymentStage: "deposit",
      purpose: "first-edition print run",
      confirmationRecipient: "printer@example.test",
    });
    expect(draft.subject).toBe("Wire request: $4,200 for The Trinity");
    expect(draft.body).toContain("deposit payment to Example Print Co: $4,200");
    expect(draft.body).toContain("The invoice is attached");
    expect(draft.body).toContain("confirmation to printer@example.test");
    expect(draft.body).not.toContain("complete the wire by");
  });

  it("grounds generated drafts in sender identity and supplied facts", () => {
    const prompt = buildOperationalDraftSystemPrompt(identity);
    expect(prompt).toContain("Put the request and the most useful facts first");
    expect(prompt).toContain("near 50 characters");
    expect(prompt).toContain("never invent");
    expect(prompt).toContain("Sokha Chan and Example Publishing");
  });
});

describe("assistant external-email drafting", () => {
  it("uses the sender and workspace sign-off for a new message", () => {
    const messages = buildExternalEmailDraftMessages({
      ...identity,
      from: "team@example.test",
      to: "partner@example.test",
      intent: "Ask for the signed agreement by Friday.",
    });
    expect(messages[0].content).toContain("on behalf of Sokha Chan at Example Publishing");
    expect(messages[0].content).toContain("Best,\nSokha Chan\nExample Publishing");
    expect(messages[1].content).toContain("Ask for the signed agreement by Friday.");
  });

  it("mirrors an established closing on replies", () => {
    const threadMessages = [
      {
        direction: "outbound",
        fromAddr: "team@example.test",
        body: "That works for us.\n\nKind regards,\nSokha\nExample Publishing",
      },
    ];
    expect(establishedThreadClosing(threadMessages)).toBe(
      "Kind regards,\nSokha\nExample Publishing"
    );
    const messages = buildExternalEmailDraftMessages({
      ...identity,
      from: "team@example.test",
      to: "partner@example.test",
      intent: "Confirm receipt.",
      threadSubject: "Re: Agreement",
      threadMessages,
    });
    expect(messages[0].content).toContain(
      "Mirror this established thread closing exactly:\nKind regards,\nSokha\nExample Publishing"
    );
    expect(messages[0].content).not.toContain("Best,\nSokha Chan");
  });
});
