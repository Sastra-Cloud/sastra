export type SharedMouReadiness = {
  status: "locked" | "ready" | "invoiced" | "sent" | "received";
  reason: string;
  completed: number;
  total: number;
  waitingProjectTitles: string[];
};

export type ReadinessMember = {
  title: string;
  status: string;
};

/** Pure, centralized gate used by UI, mutations, invoice generation, and cron. */
export function evaluateSharedMouReadiness(input: {
  members: ReadinessMember[];
  earliestInvoiceDate: string | null;
  today: string;
  invoiced: boolean;
  sent?: boolean;
  received: boolean;
  requiresCollectiveCompletion?: boolean;
  reconciliationError?: string | null;
  deliveryRequirements?: string[] | null;
  deliveryEvidence?: Array<{ requirement: string; url: string; fileId?: string }> | null;
  deliveryConfirmed?: boolean;

}): SharedMouReadiness {
  const completed = input.members.filter(
    (member) => member.status === "completed"
  ).length;
  const waitingProjectTitles = input.members
    .filter((member) => member.status !== "completed")
    .map((member) => member.title);
  const total = input.members.length;

  if (input.received) {
    return {
      status: "received",
      reason: "Payment received.",
      completed,
      total,
      waitingProjectTitles,
    };
  }
  if (input.sent) {
    return { status: "sent", reason: "Invoice sent · awaiting payment.", completed, total, waitingProjectTitles };
  }
  if (input.reconciliationError) {
    return { status: "locked", reason: input.reconciliationError,
      completed, total, waitingProjectTitles };
  }
  if (total === 0) {
    return {
      status: "locked",
      reason: "Add at least one covered project.",
      completed,
      total,
      waitingProjectTitles,
    };
  }
  if (
    input.requiresCollectiveCompletion !== false &&
    waitingProjectTitles.length > 0
  ) {
    const waiting = waitingProjectTitles.join(", ");
    return {
      status: "locked",
      reason: `${completed} of ${total} projects complete · waiting on ${waiting}.`,
      completed,
      total,
      waitingProjectTitles,
    };
  }
  if (
    input.earliestInvoiceDate &&
    input.today < input.earliestInvoiceDate
  ) {
    return {
      status: "locked",
      reason:
        input.requiresCollectiveCompletion === false
          ? `Scheduled payment unlocks ${input.earliestInvoiceDate}.`
          : `All ${total} projects complete · invoice unlocks ${input.earliestInvoiceDate}.`,
      completed,
      total,
      waitingProjectTitles,
    };
  }
  const missing = (input.deliveryRequirements ?? []).filter((requirement) =>
    !input.deliveryEvidence?.some((evidence) => evidence.requirement === requirement && (Boolean(evidence.fileId) || /^https?:\/\//i.test(evidence.url)))
  );
  if (missing.length || ((input.deliveryRequirements?.length ?? 0) > 0 && !input.deliveryConfirmed)) {
    return { status: "locked", reason: missing.length
      ? `Delivery evidence required: ${missing.join(", ")}. Manager confirmation is required.`
      : "Delivery evidence attached · manager confirmation is required.",
      completed, total, waitingProjectTitles };
  }
  if (input.invoiced) {
    return {
      status: "invoiced",
      reason: "Invoice generated.",
      completed,
      total,
      waitingProjectTitles,
    };
  }
  return {
    status: "ready",
    reason:
      input.requiresCollectiveCompletion === false
        ? "Scheduled payment is ready to invoice."
        : `All ${total} projects complete · ready to invoice.`,
    completed,
    total,
    waitingProjectTitles,
  };
}

type AllocationWeight = {
  projectId: string;
  membershipId: string;
  amount: string | number;
};

export type ReceiptAllocation = {
  projectId: string;
  membershipId: string;
  amount: string;
};

/**
 * Split a receipt proportionally by reviewed agreement shares. Fractions of a
 * cent are distributed by largest remainder, then project id, so the result is
 * deterministic and always equals the received amount exactly.
 */
export function allocateSharedReceipt(
  receivedAmount: string | number,
  weights: AllocationWeight[]
): ReceiptAllocation[] {
  const receivedCents = Math.round(Number(receivedAmount) * 100);
  const normalized = weights.map((weight) => ({
    ...weight,
    cents: Math.round(Number(weight.amount) * 100),
  }));
  const totalWeight = normalized.reduce((sum, weight) => sum + weight.cents, 0);
  if (receivedCents < 0 || totalWeight <= 0 || normalized.length === 0) {
    throw new Error("Shared receipt allocations require positive reviewed shares.");
  }

  const portions = normalized.map((weight) => {
    const exact = (receivedCents * weight.cents) / totalWeight;
    const base = Math.floor(exact);
    return { ...weight, allocated: base, remainder: exact - base };
  });
  let residue =
    receivedCents - portions.reduce((sum, portion) => sum + portion.allocated, 0);
  const residueOrder = [...portions].sort(
    (a, b) =>
      b.remainder - a.remainder || a.projectId.localeCompare(b.projectId)
  );
  for (let index = 0; residue > 0; index += 1, residue -= 1) {
    residueOrder[index % residueOrder.length].allocated += 1;
  }

  return portions
    .map((portion) => ({
      projectId: portion.projectId,
      membershipId: portion.membershipId,
      amount: (portion.allocated / 100).toFixed(2),
    }))
    .sort((a, b) => a.projectId.localeCompare(b.projectId));
}
