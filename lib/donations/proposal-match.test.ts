import { expect, it } from "vitest";

import { proposalForDonation } from "./proposal-match";

const candidate = (proposalId: string, patch = {}) => ({
  proposalId,
  projectId: "project",
  partner: "Grace Foundation",
  answered: false,
  ...patch,
});

it("links a donation to the partner's proposal and prefers a promised donation", () => {
  expect(
    proposalForDonation("The Grace Foundation", "project", [
      candidate("waiting"),
      candidate("promised", { answered: true }),
      candidate("other-project", { projectId: "other", answered: true }),
    ])
  ).toBe("promised");
});

it("does not guess between two proposals or link another donor", () => {
  expect(
    proposalForDonation("Grace Foundation", "project", [candidate("a"), candidate("b")])
  ).toBeNull();
  expect(proposalForDonation("Hope Church", "project", [candidate("a")])).toBeNull();
});
