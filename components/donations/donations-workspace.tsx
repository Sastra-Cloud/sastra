"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import {
  AlertTriangle,
  ArrowRight,
  CircleHelp,
  FileClock,
  Link2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  confirmDonationAllocations,
  resolveDonationDuplicate,
  setDonationUnallocated,
} from "@/lib/donations/actions";
import { applyUniqueExactMouMatch } from "@/lib/donations/exact-match";
import type {
  DonationAllocationDraft,
  DonationRowDTO,
  DonationWorkspaceDTO,
} from "@/lib/donations/types";
import { cn } from "@/lib/utils";

type Tab = "review" | "unallocated" | "posted" | "history";
const PAGE_SIZE = 25;

function money(value: string | number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function statusLabel(status: DonationRowDTO["reviewStatus"]) {
  switch (status) {
    case "needs_review":
      return "Needs review";
    case "possible_duplicate":
      return "Possible duplicate";
    case "unallocated":
      return "Unallocated";
    case "partially_allocated":
      return "Partly allocated";
    case "allocated":
      return "Posted";
    case "duplicate":
      return "Duplicate";
  }
}

function StatusBadge({ status }: { status: DonationRowDTO["reviewStatus"] }) {
  return (
    <Badge
      variant={
        status === "possible_duplicate"
          ? "destructive"
          : status === "allocated"
            ? "secondary"
            : "outline"
      }
      className={cn(
        status === "needs_review" &&
          "border-warning/30 bg-warning/10 text-warning-text dark:text-warning",
        status === "allocated" &&
          "bg-success/12 text-success-foreground",
        (status === "unallocated" || status === "partially_allocated") &&
          "bg-muted text-muted-foreground"
      )}
    >
      {statusLabel(status)}
    </Badge>
  );
}

function ConfidenceBadge({
  confidence,
}: {
  confidence: DonationRowDTO["suggestion"]["confidence"];
}) {
  if (confidence === "none") {
    return <span className="text-xs text-muted-foreground">No suggestion</span>;
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        confidence === "strong"
          ? "border-success/30 bg-success/10 text-success-foreground"
          : "border-warning/30 bg-warning/10 text-warning-text"
      )}
    >
      {confidence === "strong" ? "Strong" : "Possible"}
    </Badge>
  );
}

function belongsToTab(row: DonationRowDTO, tab: Tab) {
  if (tab === "review") {
    return (
      row.reviewStatus === "needs_review" ||
      row.reviewStatus === "possible_duplicate"
    );
  }
  if (tab === "unallocated") {
    return (
      row.reviewStatus === "unallocated" ||
      row.reviewStatus === "partially_allocated"
    );
  }
  if (tab === "posted") {
    return (
      row.reviewStatus === "allocated" ||
      row.reviewStatus === "partially_allocated"
    );
  }
  return false;
}

export function DonationsWorkspace({ data }: { data: DonationWorkspaceDTO }) {
  const [tab, setTab] = useState<Tab>(
    data.summary.needsReviewCount > 0 ? "review" : "unallocated"
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const initialSelected =
    data.donations.find((row) => belongsToTab(row, tab))?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected);
  const panelRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.donations.filter((row) => {
      if (!belongsToTab(row, tab)) return false;
      if (!query) return true;
      return [row.donor, row.notes, row.campaign, row.suggestion.summary]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  }, [data.donations, search, tab]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );
  const selectedCandidate = data.donations.find(
    (row) => row.id === selectedId
  );
  const selected =
    selectedCandidate && belongsToTab(selectedCandidate, tab)
      ? selectedCandidate
      : visible[0] ?? null;

  function changeTab(nextTab: Tab) {
    setTab(nextTab);
    setPage(0);
    setSelectedId(null);
  }

  function choose(row: DonationRowDTO) {
    setSelectedId(row.id);
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 1023px)").matches) {
        panelRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex max-w-full gap-1 overflow-x-auto border-b">
        {(
          [
            ["review", "Needs review", data.summary.needsReviewCount, money(data.summary.needsReviewAmount, data.summary.currency)],
            ["unallocated", "Unallocated", data.summary.unallocatedCount, money(data.summary.unallocatedAmount, data.summary.currency)],
            ["posted", "Posted", data.summary.postedCount, money(data.summary.postedAmount, data.summary.currency)],
            ["history", "Import history", data.imports.length, null],
          ] as const
        ).map(([value, label, count, amount]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => changeTab(value)}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
              tab === value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <span>{label}{amount ? <span className="block text-xs font-normal tabular-nums text-muted-foreground">{amount}</span> : null}</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
              {count}
            </span>
          </button>
        ))}
      </div>

      {tab === "history" ? (
        <ImportHistory data={data} />
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_25rem]">
          <Card className="min-w-0 lg:order-1">
            <CardHeader className="border-b pb-4">
              <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(0);
                    setSelectedId(null);
                  }}
                  placeholder="Search donor, note, or project"
                  className="pl-9"
                  aria-label="Search donations"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {visible.length === 0 ? (
                <div className="px-5 py-14 text-center">
                  <CircleHelp className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-3 font-medium">
                    {search ? "No donations match this search" : "No donations here"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {tab === "review"
                      ? "New imported donations will appear here for review."
                      : tab === "unallocated"
                        ? "Donations kept outside a project will appear here."
                        : "Confirmed project allocations will appear here."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[42rem] text-sm">
                      <thead>
                        <tr className="border-b bg-muted/35 text-left text-xs text-muted-foreground">
                          <th className="px-4 py-3 font-medium">Date</th>
                          <th className="px-4 py-3 font-medium">Donor</th>
                          <th className="px-4 py-3 text-right font-medium">
                            Amount
                          </th>
                          <th className="px-4 py-3 font-medium">Suggested match</th>
                          <th className="px-4 py-3 font-medium">Confidence</th>
                          <th className="hidden px-4 py-3 font-medium 2xl:table-cell">
                            Status
                          </th>
                          <th className="w-10 px-2 py-3">
                            <span className="sr-only">Review</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((row) => (
                          <tr
                            key={row.id}
                            className={cn(
                              "border-b transition-colors last:border-b-0 hover:bg-muted/35",
                              selected?.id === row.id && "bg-primary/6"
                            )}
                          >
                            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                              {row.donationDate}
                            </td>
                            <td className="max-w-52 px-4 py-3">
                              <button
                                type="button"
                                onClick={() => choose(row)}
                                className="block w-full truncate text-left font-medium outline-none hover:text-primary focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring/50"
                              >
                                {row.donor}
                              </button>
                              {row.notes ? (
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                  {row.notes}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">
                              {money(row.amount, row.currency)}
                            </td>
                            <td className="max-w-64 px-4 py-3">
                              <p className="truncate">{row.suggestion.summary}</p>
                            </td>
                            <td className="px-4 py-3">
                              <ConfidenceBadge
                                confidence={row.suggestion.confidence}
                              />
                            </td>
                            <td className="hidden px-4 py-3 2xl:table-cell">
                              <StatusBadge status={row.reviewStatus} />
                            </td>
                            <td className="px-2 py-3">
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Review donation from ${row.donor}`}
                                onClick={() => choose(row)}
                              >
                                <ArrowRight className="size-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ul className="divide-y md:hidden">
                    {visible.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => choose(row)}
                          className={cn(
                            "flex min-h-20 w-full items-center justify-between gap-3 px-4 py-3 text-left",
                            selected?.id === row.id && "bg-primary/6"
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {row.donor}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{row.donationDate}</span>
                              <StatusBadge status={row.reviewStatus} />
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block font-semibold tabular-nums">
                              {money(row.amount, row.currency)}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {row.suggestion.confidence === "none"
                                ? "No suggestion"
                                : row.suggestion.confidence === "strong"
                                  ? "Strong match"
                                  : "Possible match"}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
                    <p className="text-xs text-muted-foreground">
                      {currentPage * PAGE_SIZE + 1}–
                      {Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of{" "}
                      {filtered.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 0}
                        onClick={() => {
                          setPage((value) => Math.max(0, value - 1));
                          setSelectedId(null);
                        }}
                      >
                        Previous
                      </Button>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        Page {currentPage + 1} of {pageCount}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= pageCount - 1}
                        onClick={() => {
                          setPage((value) =>
                            Math.min(pageCount - 1, value + 1)
                          );
                          setSelectedId(null);
                        }}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div
            ref={panelRef}
            className="min-h-[calc(100svh-5rem)] scroll-mt-20 lg:order-2 lg:min-h-0"
          >
            {selected ? (
              <DonationReviewPanel
                key={selected.id}
                donation={selected}
                projects={data.projects}
                mouPayments={data.mouPayments}
              />
            ) : (
              <Card className="lg:sticky lg:top-20">
                <CardContent className="py-14 text-center text-sm text-muted-foreground">
                  Select a donation to review it.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ImportHistory({ data }: { data: DonationWorkspaceDTO }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-start gap-3">
          <FileClock className="mt-0.5 size-5 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">Monthly import history</h2>
            <p className="text-sm text-muted-foreground">
              Every file is checked against all earlier donation rows.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {data.imports.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            No donation CSV has been imported.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b bg-muted/35 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Imported</th>
                  <th className="px-4 py-3 text-right font-medium">Successful</th>
                  <th className="px-4 py-3 text-right font-medium">Added</th>
                  <th className="px-4 py-3 text-right font-medium">Duplicates</th>
                  <th className="px-4 py-3 text-right font-medium">Failed</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.imports.map((item) => (
                  <tr key={item.id} className="border-b last:border-b-0">
                    <td className="max-w-72 px-4 py-3">
                      <p className="truncate font-medium">{item.sourceFilename}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.createdByName ?? "Former admin"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(item.createdAt))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {item.successfulRows}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {item.newRows}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {item.exactDuplicateRows}
                      {item.possibleDuplicateRows > 0 ? (
                        <span className="block text-xs text-warning-text">
                          {item.possibleDuplicateRows} possible
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {item.failedRows}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {money(item.successfulAmount, item.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DonationReviewPanel({
  donation,
  projects,
  mouPayments,
}: {
  donation: DonationRowDTO;
  projects: DonationWorkspaceDTO["projects"];
  mouPayments: DonationWorkspaceDTO["mouPayments"];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<
    "allocation" | "unallocated" | "duplicate" | null
  >(null);
  const [reason, setReason] = useState("");
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const suggestedCandidateRows =
    donation.allocations.length > 0 || donation.suggestion.allocations.length > 0
      ? []
      : donation.suggestion.candidateProjectIds.slice(0, 8).map((projectId) => ({
          key: `candidate-${projectId}`,
          projectId,
          projectTitle: projectById.get(projectId)?.title ?? "Project",
          amount: "",
          mouPaymentId: null,
          sharedMouGroupId: null,
          evidence: ["Related project. Enter the amount after review."],
        }));
  const initialAllocations =
    donation.allocations.length > 0
      ? donation.allocations
      : donation.suggestion.allocations.length > 0
        ? donation.suggestion.allocations
        : suggestedCandidateRows;
  const [allocations, setAllocations] = useState<DonationAllocationDraft[]>(
    initialAllocations.map((row) =>
      applyUniqueExactMouMatch(row, donation.currency, mouPayments)
    )
  );
  const currentPosted = donation.allocations.length > 0;
  const totalCents = Math.round(Number(donation.amount) * 100);
  const allocatedCents = allocations.reduce(
    (sum, row) => sum + Math.round(Number(row.amount || 0) * 100),
    0
  );
  const remainingCents = totalCents - allocatedCents;
  const wrongSign = allocations.some((row) => {
    const rowCents = Math.round(Number(row.amount || 0) * 100);
    return rowCents !== 0 && Math.sign(rowCents) !== Math.sign(totalCents);
  });
  const overallocated = Math.abs(allocatedCents) > Math.abs(totalCents);
  const validRows = allocations.filter(
    (row) =>
      row.projectId &&
      Number.isFinite(Number(row.amount)) &&
      Number(row.amount) !== 0 &&
      Math.sign(Number(row.amount)) === Math.sign(totalCents)
  );
  const allocationValid =
    validRows.length > 0 &&
    validRows.length === allocations.filter((row) => row.amount !== "").length &&
    !wrongSign &&
    !overallocated &&
    (!currentPosted || reason.trim().length >= 3);

  function changeProject(index: number, projectId: string) {
    const project = projectById.get(projectId);
    setAllocations((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? applyUniqueExactMouMatch(
              {
                ...row,
                projectId,
                projectTitle: project?.title ?? "Project",
                mouPaymentId: null,
                sharedMouGroupId: null,
                evidence: [],
              },
              donation.currency,
              mouPayments
            )
          : row
      )
    );
  }

  function changeAmount(index: number, value: string) {
    setAllocations((current) => {
      const changed = current[index];
      const clearSharedGroup = changed?.sharedMouGroupId ?? null;
      return current.map((row, rowIndex) => {
        if (clearSharedGroup && row.sharedMouGroupId === clearSharedGroup) {
          return {
            ...row,
            amount: rowIndex === index ? value : row.amount,
            mouPaymentId: null,
            sharedMouGroupId: null,
            evidence: [],
          };
        }
        return rowIndex === index
          ? applyUniqueExactMouMatch(
              {
                ...row,
                amount: value,
                mouPaymentId: null,
                sharedMouGroupId: null,
                evidence: [],
              },
              donation.currency,
              mouPayments
            )
          : row;
      });
    });
  }

  function addProject() {
    setAllocations((current) => [
      ...current,
      {
        key: `manual-${crypto.randomUUID()}`,
        projectId: "",
        projectTitle: "",
        amount: "",
        mouPaymentId: null,
        sharedMouGroupId: null,
        evidence: [],
      },
    ]);
  }

  function confirmAllocation() {
    setPendingAction("allocation");
    startTransition(async () => {
      try {
        const result = await confirmDonationAllocations({
          donationId: donation.id,
          allocations: validRows.map((row) => ({
            projectId: row.projectId,
            amount: Number(row.amount),
            mouPaymentId: row.mouPaymentId,
            sharedMouGroupId: row.sharedMouGroupId,
            note: row.evidence.join(" ") || null,
          })),
          reason: reason.trim() || null,
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        const marksMouReceived = validRows.some((row) => row.mouPaymentId);
        toast.success(
          marksMouReceived
            ? "Project funding posted and the matching MoU payment marked received."
            : remainingCents !== 0
            ? "Project funding posted. The remainder stays unallocated."
            : "Project funding posted."
        );
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  }

  async function keepUnallocated() {
    if (
      currentPosted &&
      !(await confirmDialog("Remove the current project allocations and keep this donation unallocated?"))
    ) {
      return;
    }
    setPendingAction("unallocated");
    startTransition(async () => {
      try {
        const result = await setDonationUnallocated({
          donationId: donation.id,
          reason: reason.trim() || null,
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Donation kept unallocated.");
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  }

  if (donation.reviewStatus === "possible_duplicate") {
    return (
      <DuplicateReviewPanel
        donation={donation}
        reason={reason}
        pending={pending}
        pendingAction={pendingAction}
        onReasonChange={setReason}
        onResolve={(resolution) => {
          setPendingAction("duplicate");
          startTransition(async () => {
            try {
              const result = await resolveDonationDuplicate({
                donationId: donation.id,
                resolution,
                reason,
              });
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success(
                resolution === "distinct"
                  ? "Donation marked as a new gift."
                  : "Duplicate removed from the review queue."
              );
              router.refresh();
            } finally {
              setPendingAction(null);
            }
          });
        }}
      />
    );
  }

  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader className="space-y-3 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{donation.donor}</h2>
            <p className="text-sm text-muted-foreground">
              {donation.donationDate} · {money(donation.amount, donation.currency)}
            </p>
          </div>
          <StatusBadge status={donation.reviewStatus} />
        </div>
        <p className="text-xs text-muted-foreground">
          {donation.sourceFilename} · row {donation.sourceRowNumber}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Suggested project links</h3>
            <ConfidenceBadge confidence={donation.suggestion.confidence} />
          </div>
          <p className="text-sm text-muted-foreground">
            {donation.suggestion.summary}
          </p>
          {donation.suggestion.evidence.length > 0 ? (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {donation.suggestion.evidence.map((item) => (
                <li key={item} className="flex gap-2">
                  <Link2 className="mt-0.5 size-3.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="space-y-3 border-t pt-4">
          {allocations.map((row, index) => (
            <div key={row.key} className="space-y-2 rounded-lg bg-muted/35 p-3">
              <div className="flex items-center gap-2">
                <select
                  value={row.projectId}
                  onChange={(event) => changeProject(index, event.target.value)}
                  disabled={pending}
                  aria-label={`Project for allocation ${index + 1}`}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">Choose project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove allocation ${index + 1}`}
                  disabled={pending}
                  onClick={() =>
                    setAllocations((current) =>
                      current.filter((_, rowIndex) => rowIndex !== index)
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`allocation-${row.key}`} className="text-xs">
                  Amount ({donation.currency})
                </Label>
                <Input
                  id={`allocation-${row.key}`}
                  type="number"
                  min={totalCents > 0 ? "0.01" : undefined}
                  max={totalCents < 0 ? "-0.01" : undefined}
                  step="0.01"
                  value={row.amount}
                  disabled={pending}
                  onChange={(event) => changeAmount(index, event.target.value)}
                  className="tabular-nums"
                  placeholder="0.00"
                />
              </div>
              {row.evidence.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {row.evidence.join(" ")}
                </p>
              ) : null}
              {row.mouPaymentId && !row.sharedMouGroupId ? (
                <div className="flex flex-col gap-2 rounded-md border border-info/25 bg-info/5 px-2.5 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-start gap-2">
                    <Link2 className="mt-0.5 size-3.5 shrink-0 text-info" />
                    <span>
                      Exact MoU payment match. Confirming this allocation will
                      mark that payment received.
                    </span>
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    disabled={pending}
                    onClick={() =>
                      setAllocations((current) =>
                        current.map((item, rowIndex) =>
                          rowIndex === index
                            ? { ...item, mouPaymentId: null, evidence: [] }
                            : item
                        )
                      )
                    }
                  >
                    Keep as donation only
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addProject}
            disabled={pending}
          >
            <Plus className="size-4" />
            Add project
          </Button>
        </section>

        <section className="space-y-2 border-t pt-4 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Allocated</span>
            <span className="font-medium tabular-nums">
              {money(allocatedCents / 100, donation.currency)}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Remaining unallocated</span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                (wrongSign || overallocated) && "text-destructive"
              )}
            >
              {money(remainingCents / 100, donation.currency)}
            </span>
          </div>
          {wrongSign ? (
            <p className="text-xs text-destructive">
              Use negative project amounts for a refund or reversal.
            </p>
          ) : overallocated ? (
            <p className="text-xs text-destructive">
              Reduce the allocations to match the donation.
            </p>
          ) : remainingCents !== 0 && allocatedCents !== 0 ? (
            <p className="text-xs text-muted-foreground">
              The remaining amount will stay in the workspace ledger.
            </p>
          ) : null}
        </section>

        {donation.notes ? (
          <section className="border-t pt-4">
            <h3 className="text-xs font-medium text-muted-foreground">
              Donation note
            </h3>
            <p className="mt-1 text-sm text-pretty">{donation.notes}</p>
          </section>
        ) : null}

        {currentPosted ? (
          <div className="grid gap-1 border-t pt-4">
            <Label htmlFor={`reason-${donation.id}`}>Reason for change</Label>
            <Textarea
              id={`reason-${donation.id}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why the posted allocation is changing."
              disabled={pending}
            />
          </div>
        ) : null}

        <div className="grid gap-2 border-t pt-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending || (currentPosted && reason.trim().length < 3)}
            onClick={keepUnallocated}
          >
            {pendingAction === "unallocated"
              ? "Saving…"
              : currentPosted
                ? "Remove allocations"
                : "Keep unallocated"}
          </Button>
          <Button
            type="button"
            disabled={pending || !allocationValid}
            onClick={confirmAllocation}
          >
            {pendingAction === "allocation"
              ? "Posting funding…"
              : "Confirm allocation"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DuplicateReviewPanel({
  donation,
  reason,
  pending,
  pendingAction,
  onReasonChange,
  onResolve,
}: {
  donation: DonationRowDTO;
  reason: string;
  pending: boolean;
  pendingAction: "allocation" | "unallocated" | "duplicate" | null;
  onReasonChange: (value: string) => void;
  onResolve: (resolution: "distinct" | "duplicate") => void;
}) {
  return (
    <Card className="border-destructive/35 lg:sticky lg:top-20">
      <CardHeader className="space-y-3 border-b">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <h2 className="font-semibold">Possible duplicate</h2>
            <p className="text-sm text-muted-foreground">
              Sastra already has a donation from this donor for the same amount
              on this date.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/45 p-3 text-sm">
          <p className="font-medium">{donation.donor}</p>
          <p className="mt-1 text-muted-foreground">
            {donation.donationDate} · {money(donation.amount, donation.currency)}
          </p>
          {donation.notes ? <p className="mt-2">{donation.notes}</p> : null}
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`duplicate-reason-${donation.id}`}>
            Reason for decision
          </Label>
          <Textarea
            id={`duplicate-reason-${donation.id}`}
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Example: Two separate checks arrived on the same day."
            disabled={pending}
          />
        </div>
        <div className="grid gap-2">
          <Button
            type="button"
            disabled={pending || reason.trim().length < 3}
            onClick={() => onResolve("distinct")}
          >
            {pendingAction === "duplicate"
              ? "Saving decision…"
              : "Keep as new donation"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending || reason.trim().length < 3}
            onClick={() => onResolve("duplicate")}
          >
            {pendingAction === "duplicate"
              ? "Saving decision…"
              : "Confirm duplicate"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
