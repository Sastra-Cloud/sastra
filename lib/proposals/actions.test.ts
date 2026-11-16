import { beforeEach, expect, it, vi } from "vitest";
import {
  PartnerQuotationError,
  partnerQuotationVersion,
  type PartnerQuotationDTO,
} from "@/lib/budget/partner-quotations";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  context: vi.fn(),
  send: vi.fn(),
  allocatedFile: vi.fn(),
  approval: vi.fn(),
  put: vi.fn(),
  values: vi.fn(),
  drafts: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.guard }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", async () => {
  const { getTableName } = await import("drizzle-orm");
  return {
    db: {
      select: () => ({
        from: (table: Parameters<typeof getTableName>[0]) => ({
          where: () => ({
            limit: async () =>
              getTableName(table) === "projects"
                ? [{ id: "project", title: "Book", slug: "book", kind: "book" }]
                : [],
          }),
        }),
      }),
      insert: (table: Parameters<typeof getTableName>[0]) => ({
        values: (value: unknown) => {
          mocks.values(getTableName(table), value);
          return {
            returning: async () => [{ id: "submission", sentAt: new Date(0) }],
          };
        },
      }),
    },
  };
});
vi.mock("@/lib/budget/queries", () => ({
  getBudgetData: async () => ({ settings: {}, items: [], presentation: null }),
}));
vi.mock("@/lib/budget/partner-quotation-context", () => ({
  getPartnerQuotationContext: mocks.context,
}));
vi.mock("@/lib/budget/partner-quotation-queries", () => ({
  listPartnerQuotations: async () => [],
}));
vi.mock("@/lib/budget/quotation-file", () => ({
  buildAllocatedQuotationBuffer: mocks.allocatedFile,
  buildPartnerQuotationBuffer: vi.fn(),
  buildQuotationBuffer: vi.fn(),
}));
vi.mock("@/lib/budget/pdf", () => ({ buildPerCopyQuotationPdf: vi.fn() }));
vi.mock("@/lib/budget/approval-service", () => ({
  currentBudgetApprovalAuthorization: mocks.approval,
}));
vi.mock("@/lib/gmail", () => ({ sendEmail: mocks.send }));
vi.mock("@/lib/r2", () => ({ buildKey: () => "key", putObject: mocks.put }));
vi.mock("@/lib/activity/log", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/workspace/queries", () => ({
  getWorkspaceSettings: async () => ({
    orgName: "Example",
    defaultCcEmails: [],
  }),
}));
vi.mock("@/lib/email/draft-store", () => ({
  removeEmailDraftForUser: mocks.drafts,
}));
vi.mock("@/lib/print/actions", () => ({
  draftWithAi: async () => ({ subject: "Subject", body: "Body" }),
}));
import { draftMouProposal, sendMouProposal } from "./actions";

const quote: PartnerQuotationDTO = {
  id: "share",
  title: "Audio production",
  partnerId: null,
  partnerName: "Audio partner",
  contactName: "Reviewer",
  contactEmail: "audio@example.com",
  currency: "USD",
  description: "Audio only",
  lines: [
    { budgetItemId: "audio", label: "Audio production", amountCents: 125050 },
  ],
  sourceFingerprint: "source",
};
const input = {
  subject: "Review audio proposal",
  body: "Please review your share.",
  ccEmails: ["copy@example.com"],
  quotationFingerprint: partnerQuotationVersion(quote),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ user: { id: "manager", name: "Manager" } });
  mocks.context.mockResolvedValue({
    quote,
    settings: {
      currency: "USD",
      partnerName: quote.partnerName,
      partnerContactFirstName: quote.contactName,
      partnerContactEmail: quote.contactEmail,
    },
    items: [],
    total: 1250.5,
  });
  mocks.allocatedFile.mockResolvedValue(Buffer.from("partner share only"));
  mocks.approval.mockResolvedValue({
    ok: true,
    approvalRequired: false,
    requestId: null,
    fingerprint: "approval",
    snapshot: { currency: "USD" },
  });
  mocks.send.mockResolvedValue({ threadKey: "thread" });
});

// Protect the irreversible boundary: the selected saved share determines both recipient and money.
it("sends and records only the selected partner share, with its own attachment and draft", async () => {
  const result = await sendMouProposal("project", input, null, quote.id);
  expect(result.proposal).toMatchObject({
    totalAmount: "1250.50",
    recipientEmail: "audio@example.com",
  });
  expect(mocks.approval).toHaveBeenCalledWith("project", null, quote.id);
  expect(mocks.allocatedFile).toHaveBeenCalledWith(
    "project",
    "Book",
    quote.id,
    undefined,
    "book",
  );
  expect(mocks.send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: ["audio@example.com"],
      cc: ["copy@example.com"],
      attachments: [
        expect.objectContaining({ content: Buffer.from("partner share only") }),
      ],
    }),
  );
  expect(mocks.values).toHaveBeenCalledWith(
    "proposal_submissions",
    expect.objectContaining({
      partnerQuotationId: quote.id,
      totalAmount: "1250.50",
      recipientEmail: quote.contactEmail,
    }),
  );
  expect(mocks.drafts).toHaveBeenCalledWith(
    "manager",
    "funding_proposal",
    quote.id,
  );
});
it("does not send after the reviewed share, approval, or saved quotation changes", async () => {
  expect(
    await sendMouProposal(
      "project",
      { ...input, quotationFingerprint: "old review" },
      null,
      quote.id,
    ),
  ).toHaveProperty("error");
  expect(mocks.put).not.toHaveBeenCalled();
  mocks.approval.mockResolvedValueOnce({
    ok: false,
    error: "Approval required",
  });
  expect(await sendMouProposal("project", input, null, quote.id)).toEqual({
    error: "Approval required",
  });
  mocks.context.mockResolvedValueOnce({
    quote,
    settings: { currency: "USD", partnerName: quote.partnerName, partnerContactEmail: quote.contactEmail },
    total: 1250.5,
  });
  mocks.context.mockResolvedValueOnce({
    quote: { ...quote, contactEmail: "changed@example.com" },
  });
  expect(
    await sendMouProposal("project", input, null, quote.id),
  ).toHaveProperty("error");
  expect(mocks.send).not.toHaveBeenCalled();
});
it("requires manager permission before reading a draft or sending a partner proposal", async () => {
  mocks.guard.mockRejectedValue(new Error("denied"));
  await expect(draftMouProposal("project", null, quote.id)).rejects.toThrow(
    "denied",
  );
  await expect(
    sendMouProposal("project", input, null, quote.id),
  ).rejects.toThrow("denied");
  expect(mocks.context).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

it("returns a recoverable stale-quotation message before drafting or sending", async () => {
  mocks.context.mockRejectedValue(new PartnerQuotationError("Review and save this partner quotation again."));
  expect(await draftMouProposal("project", null, quote.id)).toEqual({ error: "Review and save this partner quotation again." });
  expect(await sendMouProposal("project", input, null, quote.id)).toEqual({ error: "Review and save this partner quotation again." });
  expect(mocks.send).not.toHaveBeenCalled();
});

// A funding need may be saved and approved internally, but cannot accidentally be emailed unnamed.
it("requires a partner before sending an otherwise valid saved funding need", async () => {
  mocks.context.mockResolvedValueOnce({ quote: { ...quote, partnerName: "" }, settings: { currency: "USD", partnerName: "", partnerContactEmail: quote.contactEmail }, items: [], total: 1250.5 });
  const result = await sendMouProposal("project", { ...input, quotationFingerprint: partnerQuotationVersion({ ...quote, partnerName: "" }) }, null, quote.id);
  expect(result.error).toContain("Choose a partner");
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.allocatedFile).not.toHaveBeenCalled();
});
