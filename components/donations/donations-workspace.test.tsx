import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  DonationRowDTO,
  DonationWorkspaceDTO,
} from "@/lib/donations/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/donations/actions", () => ({
  confirmDonationAllocations: vi.fn(),
  resolveDonationDuplicate: vi.fn(),
  resolveDonationDuplicates: vi.fn(),
  reopenDonationDuplicates: vi.fn(),
  setDonationUnallocated: vi.fn(),
  setDonationsUnallocated: vi.fn(),
}));
import { DonationsWorkspace } from "./donations-workspace";

const row: DonationRowDTO = {
  id: "donation",
  importId: "import",
  sourceRowNumber: 1,
  donor: "Review Partner",
  campaign: null,
  amount: "900.00",
  currency: "USD",
  donationDate: "2026-10-19",
  notes: null,
  reviewStatus: "allocated",
  duplicateOfId: null,
  duplicateOf: null,
  duplicateResolutionNote: null,
  sourceFilename: "review.csv",
  allocations: [
    {
      key: "saved",
      projectId: "project",
      projectTitle: "Quiet Courage",
      amount: "900.00",
      mouPaymentId: null,
      sharedMouGroupId: null,
      evidence: [],
    },
  ],
  allocatedAmount: "900.00",
  unallocatedAmount: "0.00",
  suggestion: {
    confidence: "possible",
    summary: "Possible match to an unrelated project.",
    evidence: ["Recomputed evidence"],
    allocations: [],
    candidateProjectIds: [],
  },
};
const data: DonationWorkspaceDTO = {
  donations: [row],
  imports: [],
  formats: [],
  projects: [
    {
      id: "project",
      title: "Quiet Courage",
      slug: "quiet-courage",
      partnerName: "Review Partner",
    },
  ],
  mouPayments: [
    {
      id: "unpaid",
      projectId: "project",
      amount: "900.00",
      currency: "USD",
      label: "On completion",
    },
  ],
  summary: {
    needsReviewCount: 0,
    needsReviewAmount: "0.00",
    unallocatedCount: 0,
    unallocatedAmount: "0.00",
    postedCount: 1,
    postedAmount: "900.00",
    currency: "USD",
  },
};
describe("saved donation allocations", () => {
  it("shows saved links and an explicit edit action without suggesting reconfirmation", () => {
    const html = renderToStaticMarkup(<DonationsWorkspace data={data} />);
    expect(html).toContain("Saved project links");
    expect(html).toContain("Linked projects");
    expect(html).toContain("Edit allocations");
    expect(html).toContain("No confirmation is needed.");
    expect(html).toContain("Project funding posted.");
    expect(html).toContain("/projects/quiet-courage/budget");
    for (const text of [
      "Suggested project links",
      "Possible match",
      "Recomputed evidence",
      "Confirm allocation",
      "Reason for change",
      "Exact MoU payment match",
    ])
      expect(html).not.toContain(text);
  });
  it("shows a saved payment as received without offering to link it again", () => {
    const html = renderToStaticMarkup(
      <DonationsWorkspace
        data={{
          ...data,
          donations: [
            {
              ...row,
              allocations: [
                { ...row.allocations[0], mouPaymentId: "received" },
              ],
            },
          ],
        }}
      />
    );
    expect(html).toContain("Scheduled payment linked and marked received.");
    expect(html).not.toContain("will mark that payment received");
  });
  it("shows sponsorship funds separately and reports partial invoice status truthfully", () => {
    const html = renderToStaticMarkup(
      <DonationsWorkspace
        data={{
          ...data,
          donations: [
            {
              ...row,
              allocations: [
                {
                  ...row.allocations[0],
                  sponsorshipId: "sponsor",
                  actualNetAmount: "810.00",
                  invoiceNumber: "INV-100",
                  invoiceStatus: "sent",
                },
              ],
            },
          ],
        }}
      />
    );
    expect(html).toContain("/sponsorships/sponsor");
    expect(html).toContain("Sponsorship funds");
    expect(html).toContain("$810.00 net recorded");
    expect(html).toContain("payment recorded");
    expect(html).not.toContain("INV-100 · received");
  });

});

describe("duplicate review", () => {
  const original: DonationRowDTO = {
    ...row,
    id: "original",
    donor: "Anonymous Donor",
    reviewStatus: "needs_review",
    allocations: [],
    sourceFilename: "giving-platform.csv",
    sourceRowNumber: 12,
  };
  const lookalike = (id: string): DonationRowDTO => ({
    ...row,
    id,
    donor: "Anonymous",
    reviewStatus: "possible_duplicate",
    allocations: [],
    duplicateOfId: "original",
    duplicateOf: {
      donor: "Anonymous Donor",
      donationDate: "2026-10-19",
      amount: "900.00",
      currency: "USD",
      sourceFilename: "giving-platform.csv",
      sourceRowNumber: 12,
      reviewStatus: "needs_review",
    },
    sourceFilename: "fund-manager.csv",
  });
  const review: DonationWorkspaceDTO = {
    ...data,
    donations: [lookalike("dup-1"), lookalike("dup-2"), original],
    summary: { ...data.summary, needsReviewCount: 3, needsReviewAmount: "2700.00" },
  };

  it("offers one action for every possible duplicate", () => {
    const html = renderToStaticMarkup(<DonationsWorkspace data={review} />);
    expect(html).toContain("2 possible duplicates");
    expect(html).toContain("Mark all 2 as duplicates");
    expect(html).toContain("Show only these");
    expect(html).toContain("Same as giving-platform.csv, row 12");
    expect(html).toContain("Select all donations on this page");
  });

  it("shows the earlier donation and makes confirming the main action", () => {
    const html = renderToStaticMarkup(<DonationsWorkspace data={review} />);
    expect(html).toContain("Already in Sastra");
    expect(html).toContain("Anonymous Donor");
    expect(html).toContain("giving-platform.csv · row 12 · Needs review");
    expect(html).toContain("Confirm duplicate");
    expect(html).toContain("It is a separate gift");
    expect(html).not.toContain("Why is this a separate gift?");
  });
});
