"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Loader2,
  Pencil,
  CircleHelp,
  FileClock,
  FileSpreadsheet,
  Link2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  confirmDonationAllocations,
  reopenDonationDuplicates,
  resolveDonationDuplicate,
  resolveDonationDuplicates,
  setDonationUnallocated,
  setDonationsUnallocated,
} from "@/lib/donations/actions";
import { applyUniqueExactMouMatch } from "@/lib/donations/exact-match";
import {
  initialDonationAllocationDrafts,
  remainingDonationAllocationAmount,
} from "@/lib/donations/allocation-draft";
import { DONATION_CSV_FIELDS } from "@/lib/donations/csv-format";
import { deleteDonationCsvFormat } from "@/lib/donations/format-actions";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import type {
  DonationAllocationDraft,
  DonationCsvFormatDTO,
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

function linkedProjects(row: DonationRowDTO) {
  return [...new Set(row.allocations.map((item) => item.projectTitle))].join(
    " · "
  );
}

/** What the list shows before a donation has project links. */
function matchSummary(row: DonationRowDTO) {
  if (row.reviewStatus !== "possible_duplicate") return row.suggestion.summary;
  return row.duplicateOf
    ? `Same as ${row.duplicateOf.sourceFilename}, row ${row.duplicateOf.sourceRowNumber}`
    : "Same as a donation Sastra already has";
}

function linkedProjectCount(row: DonationRowDTO) {
  return new Set(row.allocations.map(item => item.projectId)).size;
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
          "border-success/30 bg-success/12 text-emerald-800 dark:text-emerald-300",
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
          ? "border-success/30 bg-success/10 text-emerald-800 dark:text-emerald-300"
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
    data.summary.needsReviewCount > 0
      ? "review"
      : data.summary.unallocatedCount > 0
        ? "unallocated"
        : "posted"
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [bulkPending, setBulkPending] = useState<
    "duplicates" | "unallocated" | null
  >(null);
  const router = useRouter();
  const initialSelected =
    data.donations.find((row) => belongsToTab(row, tab))?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected);
  const panelRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.donations.filter((row) => {
      if (!belongsToTab(row, tab)) return false;
      if (
        tab === "review" &&
        duplicatesOnly &&
        row.reviewStatus !== "possible_duplicate"
      ) {
        return false;
      }
      if (!query) return true;
      return [
        row.donor,
        row.notes,
        row.campaign,
        row.suggestion.summary,
        ...row.allocations.map((allocation) => allocation.projectTitle),
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  }, [data.donations, duplicatesOnly, search, tab]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );
  const selectedCandidate = data.donations.find((row) => row.id === selectedId);
  const selected =
    selectedCandidate && belongsToTab(selectedCandidate, tab)
      ? selectedCandidate
      : (visible[0] ?? null);

  const possibleDuplicates = data.donations.filter(
    (row) => row.reviewStatus === "possible_duplicate"
  );
  const selectable = tab === "review";
  const checkedRows = selectable
    ? filtered.filter((row) => checkedIds.has(row.id))
    : [];
  const checkedDuplicates = checkedRows.filter(
    (row) => row.reviewStatus === "possible_duplicate"
  );
  const checkedWaiting = checkedRows.filter(
    (row) => row.reviewStatus === "needs_review" && !row.allocations.length
  );
  const allVisibleChecked =
    visible.length > 0 && visible.every((row) => checkedIds.has(row.id));
  const someVisibleChecked = visible.some((row) => checkedIds.has(row.id));

  function changeTab(nextTab: Tab) {
    setTab(nextTab);
    setPage(0);
    setSelectedId(null);
    setCheckedIds(new Set());
  }

  function toggleChecked(ids: string[], checked: boolean) {
    setCheckedIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  /** After a decision, open the next row so review keeps moving. */
  function advanceFrom(ids: string[]) {
    if (!selected || !ids.includes(selected.id)) return;
    const done = new Set(ids);
    const index = filtered.findIndex((row) => row.id === selected.id);
    const next =
      filtered.slice(index + 1).find((row) => !done.has(row.id)) ??
      filtered
        .slice(0, index)
        .reverse()
        .find((row) => !done.has(row.id));
    setSelectedId(next?.id ?? null);
  }

  async function undoDuplicates(ids: string[]) {
    try {
      const result = await reopenDonationDuplicates({ donationIds: ids });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Returned to duplicate review.");
      router.refresh();
    } catch {
      toast.error("Couldn't undo. Check your internet and try again.");
    }
  }

  async function markDuplicates(rows: DonationRowDTO[]) {
    const count = rows.length;
    if (!count || bulkPending) return;
    const plural = count === 1 ? "" : "s";
    const confirmed = await confirmDialog(
      `${count} donation${plural} will be marked as duplicate${plural} and will not count as money received. You can undo this right after.`,
      {
        title: `Mark ${count} as duplicate${plural}?`,
        confirmLabel: `Mark ${count} as duplicate${plural}`,
      }
    );
    if (!confirmed) return;
    const ids = rows.map((row) => row.id);
    setBulkPending("duplicates");
    try {
      const result = await resolveDonationDuplicates({ donationIds: ids });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toggleChecked(ids, false);
      advanceFrom(ids);
      if (duplicatesOnly && result.resolved === possibleDuplicates.length) {
        setDuplicatesOnly(false);
      }
      const resolved = result.resolved ?? 0;
      toast.success(
        `Marked ${resolved} duplicate${resolved === 1 ? "" : "s"}.${
          result.skipped ? ` ${result.skipped} had already changed.` : ""
        }`,
        {
          duration: 10_000,
          action: { label: "Undo", onClick: () => void undoDuplicates(ids) },
        }
      );
      router.refresh();
    } catch {
      toast.error("Couldn't save. Check your internet and try again.");
    } finally {
      setBulkPending(null);
    }
  }

  async function keepUnallocated(rows: DonationRowDTO[]) {
    const count = rows.length;
    if (!count || bulkPending) return;
    const plural = count === 1 ? "" : "s";
    const confirmed = await confirmDialog(
      `${count} donation${plural} will count as money received without a project. You can still assign projects later from Unallocated.`,
      {
        title: `Keep ${count} donation${plural} unallocated?`,
        confirmLabel: `Keep ${count} unallocated`,
      }
    );
    if (!confirmed) return;
    const ids = rows.map((row) => row.id);
    setBulkPending("unallocated");
    try {
      const result = await setDonationsUnallocated({ donationIds: ids });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toggleChecked(ids, false);
      advanceFrom(ids);
      const updated = result.updated ?? 0;
      toast.success(
        `Kept ${updated} donation${updated === 1 ? "" : "s"} unallocated.${
          result.skipped ? ` ${result.skipped} had already changed.` : ""
        }`
      );
      router.refresh();
    } catch {
      toast.error("Couldn't save. Check your internet and try again.");
    } finally {
      setBulkPending(null);
    }
  }

  function choose(row: DonationRowDTO) {
    setSelectedId(row.id);
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 1023px)").matches) {
        panelRef.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
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
            [
              "review",
              "Needs review",
              data.summary.needsReviewCount,
              money(data.summary.needsReviewAmount, data.summary.currency),
            ],
            [
              "unallocated",
              "Unallocated",
              data.summary.unallocatedCount,
              money(data.summary.unallocatedAmount, data.summary.currency),
            ],
            [
              "posted",
              "Posted",
              data.summary.postedCount,
              money(data.summary.postedAmount, data.summary.currency),
            ],
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
            <span>
              {label}
              {amount ? (
                <span className="block text-xs font-normal tabular-nums text-muted-foreground">
                  {amount}
                </span>
              ) : null}
            </span>
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
            <CardHeader className="space-y-3 border-b pb-4">
              {tab === "review" && possibleDuplicates.length > 0 ? (
                <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Copy className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {possibleDuplicates.length} possible duplicate
                        {possibleDuplicates.length === 1 ? "" : "s"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Same donor, amount, and date as a donation Sastra
                        already has. These are usually the same gift in two
                        files.
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-pressed={duplicatesOnly}
                      onClick={() => {
                        setDuplicatesOnly((value) => !value);
                        setPage(0);
                        setSelectedId(null);
                      }}
                    >
                      {duplicatesOnly ? "Show all" : "Show only these"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={bulkPending !== null}
                      onClick={() => markDuplicates(possibleDuplicates)}
                    >
                      {bulkPending === "duplicates" ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Marking duplicates…
                        </>
                      ) : possibleDuplicates.length === 1 ? (
                        "Mark as duplicate"
                      ) : (
                        `Mark all ${possibleDuplicates.length} as duplicates`
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}
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
              {checkedRows.length > 0 ? (
                <div
                  role="region"
                  aria-label="Actions for selected donations"
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-muted px-3 py-2"
                >
                  <p className="text-sm font-medium tabular-nums">
                    {checkedRows.length} selected
                  </p>
                  {checkedRows.length < filtered.length ? (
                    <button
                      type="button"
                      className="text-sm text-primary underline-offset-4 hover:underline"
                      onClick={() =>
                        toggleChecked(
                          filtered.map((row) => row.id),
                          true
                        )
                      }
                    >
                      Select all {filtered.length}
                    </button>
                  ) : null}
                  <div className="flex flex-wrap gap-2 sm:ml-auto">
                    {checkedDuplicates.length > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={bulkPending !== null}
                        onClick={() => markDuplicates(checkedDuplicates)}
                      >
                        {bulkPending === "duplicates" ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Marking duplicates…
                          </>
                        ) : (
                          `Mark ${checkedDuplicates.length} as duplicate${
                            checkedDuplicates.length === 1 ? "" : "s"
                          }`
                        )}
                      </Button>
                    ) : null}
                    {checkedWaiting.length > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={bulkPending !== null}
                        onClick={() => keepUnallocated(checkedWaiting)}
                      >
                        {bulkPending === "unallocated" ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Saving…
                          </>
                        ) : (
                          `Keep ${checkedWaiting.length} unallocated`
                        )}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={bulkPending !== null}
                      onClick={() => setCheckedIds(new Set())}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="p-0">
              {visible.length === 0 ? (
                <div className="px-5 py-14 text-center">
                  <CircleHelp className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-3 font-medium">
                    {search
                      ? "No donations match this search"
                      : "No donations here"}
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
                          {selectable ? (
                            <th className="w-10 py-3 pr-0 pl-4">
                              <Checkbox
                                aria-label="Select all donations on this page"
                                checked={allVisibleChecked}
                                indeterminate={
                                  someVisibleChecked && !allVisibleChecked
                                }
                                onCheckedChange={(checked) =>
                                  toggleChecked(
                                    visible.map((row) => row.id),
                                    checked === true
                                  )
                                }
                              />
                            </th>
                          ) : null}
                          <th className="px-4 py-3 font-medium">Date</th>
                          <th className="px-4 py-3 font-medium">Donor</th>
                          <th className="px-4 py-3 text-right font-medium">
                            Amount
                          </th>
                          <th className="px-4 py-3 font-medium">
                            {tab === "posted"
                              ? "Linked projects"
                              : "Project match"}
                          </th>
                          {tab !== "posted" ? (
                            <th className="px-4 py-3 font-medium">
                              Confidence
                            </th>
                          ) : null}
                          <th
                            className={cn(
                              "px-4 py-3 font-medium",
                              tab !== "posted" && "hidden 2xl:table-cell"
                            )}
                          >
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
                            {selectable ? (
                              <td className="py-3 pr-0 pl-4">
                                <Checkbox
                                  aria-label={`Select donation from ${row.donor}`}
                                  checked={checkedIds.has(row.id)}
                                  onCheckedChange={(checked) =>
                                    toggleChecked([row.id], checked === true)
                                  }
                                />
                              </td>
                            ) : null}
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
                              {row.reviewStatus === "possible_duplicate" ? (
                                <p className="truncate font-medium text-destructive">
                                  Possible duplicate
                                </p>
                              ) : null}
                              <p
                                className={cn(
                                  "truncate",
                                  row.reviewStatus === "possible_duplicate" &&
                                    "text-xs text-muted-foreground"
                                )}
                                title={
                                  linkedProjects(row) || matchSummary(row)
                                }
                              >
                                {row.allocations.length
                                  ? linkedProjects(row)
                                  : matchSummary(row)}
                              </p>
                            </td>
                            {tab !== "posted" ? (
                              <td className="px-4 py-3">
                                {row.allocations.length ? (
                                  <span className="text-xs text-muted-foreground">
                                    Saved links
                                  </span>
                                ) : row.reviewStatus === "possible_duplicate" ? (
                                  <span className="text-xs text-muted-foreground">
                                    —
                                  </span>
                                ) : (
                                  <ConfidenceBadge
                                    confidence={row.suggestion.confidence}
                                  />
                                )}
                              </td>
                            ) : null}
                            <td
                              className={cn(
                                "px-4 py-3",
                                tab !== "posted" && "hidden 2xl:table-cell"
                              )}
                            >
                              <StatusBadge status={row.reviewStatus} />
                            </td>
                            <td className="px-2 py-3">
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`${row.allocations.length ? "View" : "Review"} donation from ${row.donor}`}
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
                      <li
                        key={row.id}
                        className={cn(
                          "flex items-center",
                          selected?.id === row.id && "bg-primary/6"
                        )}
                      >
                        {selectable ? (
                          <span className="flex self-stretch items-center pl-4">
                            <Checkbox
                              aria-label={`Select donation from ${row.donor}`}
                              checked={checkedIds.has(row.id)}
                              onCheckedChange={(checked) =>
                                toggleChecked([row.id], checked === true)
                              }
                            />
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => choose(row)}
                          className="flex min-h-20 min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {row.donor}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{row.donationDate}</span>
                              <StatusBadge status={row.reviewStatus} />
                            </span>
                            {row.allocations.length ? (
                              <span className="mt-1 block truncate text-xs text-muted-foreground">
                                {linkedProjects(row)}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block font-semibold tabular-nums">
                              {money(row.amount, row.currency)}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {row.allocations.length
                                ? `${linkedProjectCount(row)} linked ${linkedProjectCount(row) === 1 ? "project" : "projects"}`
                                : row.suggestion.confidence === "none"
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
                      {Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)}{" "}
                      of {filtered.length}
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
                key={`${selected.id}-${selected.reviewStatus}-${JSON.stringify(selected.allocations)}`}
                donation={selected}
                projects={data.projects}
                mouPayments={data.mouPayments}
                onDone={
                  tab === "review"
                    ? () => advanceFrom([selected.id])
                    : undefined
                }
                onUndoDuplicate={(id) => void undoDuplicates([id])}
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
    <div className="space-y-4">
      <ImportHistoryTable data={data} />
      <SavedCsvFormats formats={data.formats} />
    </div>
  );
}

function removeFormat(
  formats: DonationCsvFormatDTO[],
  formatId: string
): DonationCsvFormatDTO[] {
  return formats.filter((format) => format.id !== formatId);
}

function mappedColumns(format: DonationCsvFormatDTO) {
  return DONATION_CSV_FIELDS.flatMap(({ field, label }) => {
    const header = format.mapping.columns[field];
    return header ? [`${label}: ${header}`] : [];
  });
}

function SavedCsvFormats({ formats }: { formats: DonationCsvFormatDTO[] }) {
  const router = useRouter();
  const action = useOptimisticAction({ state: formats, update: removeFormat });

  async function forget(format: DonationCsvFormatDTO) {
    const confirmed = await confirmDialog(
      `Sastra will ask you to check the columns again the next time you import a "${format.name}" file. Imported donations are not changed.`,
      { title: "Forget this CSV format?", confirmLabel: "Forget format", destructive: true }
    );
    if (!confirmed) return;
    action.run(format.id, () => deleteDonationCsvFormat(format.id), {
      errorMessage: "Couldn't forget the format. Try again.",
      onSuccess: () => router.refresh(),
    });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 size-5 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">Saved CSV formats</h2>
            <p className="text-sm text-muted-foreground">
              Files with these columns import without the setup step. The
              built-in giving-platform export is always recognized.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {action.state.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No saved formats. When you import a new kind of CSV, Sastra saves
            its columns here.
          </p>
        ) : (
          <ul className="divide-y">
            {action.state.map((format) => (
              <li
                key={format.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{format.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {mappedColumns(format).join(" · ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format.lastUsedAt
                      ? `Last used ${new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                        }).format(new Date(format.lastUsedAt))}`
                      : "Not used yet"}
                    {format.createdByName ? ` · Set up by ${format.createdByName}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start text-muted-foreground hover:text-destructive"
                  onClick={() => forget(format)}
                >
                  <Trash2 className="size-4" />
                  Forget
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ImportHistoryTable({ data }: { data: DonationWorkspaceDTO }) {
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
                  <th className="px-4 py-3 text-right font-medium">
                    Successful
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Added</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Duplicates
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Failed</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.imports.map((item) => (
                  <tr key={item.id} className="border-b last:border-b-0">
                    <td className="max-w-72 px-4 py-3">
                      <p className="truncate font-medium">
                        {item.sourceFilename}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.createdByName ?? "Former admin"}
                        {item.formatName ? ` · ${item.formatName}` : ""}
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
  onDone,
  onUndoDuplicate,
}: {
  donation: DonationRowDTO;
  projects: DonationWorkspaceDTO["projects"];
  mouPayments: DonationWorkspaceDTO["mouPayments"];
  /** Called after a decision that moves the donation out of review. */
  onDone?: () => void;
  onUndoDuplicate?: (donationId: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<
    "allocation" | "unallocated" | "duplicate" | null
  >(null);
  const [reason, setReason] = useState("");
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const [allocations, setAllocations] = useState<DonationAllocationDraft[]>(
    () => initialDonationAllocationDrafts(donation, projects, mouPayments)
  );
  const currentPosted = donation.allocations.length > 0;
  const [editing, setEditing] = useState(!currentPosted);
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
    validRows.length ===
      allocations.filter((row) => row.amount !== "").length &&
    !wrongSign &&
    !overallocated &&
    allocations.every(
      (row) =>
        !row.sponsorshipId ||
        (row.actualNetAmount !== "" &&
          Number.isFinite(Number(row.actualNetAmount)) &&
          Number(row.actualNetAmount) >= 0 &&
          Number(row.actualNetAmount) <= Number(row.amount))
    ) &&
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
        amount: remainingDonationAllocationAmount(donation.amount, current),
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
            invoiceId: row.invoiceId,
            actualNetAmount: row.actualNetAmount
              ? Number(row.actualNetAmount)
              : null,
            note: row.evidence.join(" ") || null,
          })),
          reason: reason.trim() || null,
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        const marksMouReceived = validRows.some((row) => row.mouPaymentId);
        const marksInvoiceReceived = validRows.some((row) => row.invoiceId);
        toast.success(
          marksInvoiceReceived
            ? "Funding posted and invoice payments recorded."
            : marksMouReceived
              ? "Project funding posted and the matching MoU payment marked received."
              : remainingCents !== 0
                ? "Project funding posted. The remainder stays unallocated."
                : "Project funding posted."
        );
        onDone?.();
        router.refresh();
      } catch {
        toast.error("Could not save. Check your connection and try again.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  async function keepUnallocated() {
    if (
      currentPosted &&
      !(await confirmDialog(
        "Remove the current project allocations and keep this donation unallocated?"
      ))
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
        onDone?.();
        router.refresh();
      } catch {
        toast.error("Could not save. Check your connection and try again.");
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
                reason: reason.trim() || undefined,
              });
              if (result.error) {
                toast.error(result.error);
                return;
              }
              if (resolution === "distinct") {
                toast.success("Kept as a new gift. Review its project match.");
              } else {
                toast.success("Marked as a duplicate.", {
                  duration: 10_000,
                  action: onUndoDuplicate
                    ? {
                        label: "Undo",
                        onClick: () => onUndoDuplicate(donation.id),
                      }
                    : undefined,
                });
                onDone?.();
              }
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
              {donation.donationDate} ·{" "}
              {money(donation.amount, donation.currency)}
            </p>
          </div>
          <StatusBadge status={donation.reviewStatus} />
        </div>
        <p className="text-xs text-muted-foreground">
          {donation.sourceFilename} · row {donation.sourceRowNumber}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {currentPosted && !editing ? (
          <>
            <section className="space-y-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                <div>
                  <h3 className="text-sm font-semibold">Saved project links</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This funding is already posted. No confirmation is needed.
                  </p>
                </div>
              </div>
              <ul className="divide-y">
                {donation.allocations.map((row) => (
                  <li key={row.key} className="space-y-1 py-3">
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <Link
                        href={
                          row.sponsorshipId
                            ? `/sponsorships/${row.sponsorshipId}`
                            : `/projects/${projects.find((project) => project.id === row.projectId)?.slug ?? row.projectId}/budget`
                        }
                        className="min-w-0 font-medium text-pretty hover:underline"
                      >
                        {row.projectTitle}
                      </Link>
                      <span className="shrink-0 tabular-nums">
                        {money(row.amount, donation.currency)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {row.sponsorshipId
                        ? `Sponsorship funds · ${money(row.actualNetAmount ?? row.amount, donation.currency)} net recorded`
                        : row.mouPaymentId
                          ? "Scheduled payment linked and marked received."
                          : "Project funding posted."}
                    </p>
                    {row.invoiceNumber ? (
                      <p className="text-xs text-muted-foreground">
                        Invoice {row.invoiceNumber} ·{" "}
                        {row.invoiceStatus === "received"
                          ? "received"
                          : "payment recorded"}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
              {Number(donation.unallocatedAmount) !== 0 ? (
                <p className="text-sm text-muted-foreground">
                  {money(donation.unallocatedAmount, donation.currency)} remains
                  unallocated. Edit allocations to assign it.
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-4" />
                Edit allocations
              </Button>
            </section>
            {donation.notes ? (
              <section className="border-t pt-4">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Donation note
                </h3>
                <p className="mt-1 text-sm text-pretty">{donation.notes}</p>
              </section>
            ) : null}
          </>
        ) : (
          <>
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">
                  {currentPosted
                    ? "Edit saved allocations"
                    : "Suggested project links"}
                </h3>
                {!currentPosted ? (
                  <ConfidenceBadge
                    confidence={donation.suggestion.confidence}
                  />
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {currentPosted
                  ? "Changes are saved only after you confirm. Add a reason below."
                  : donation.suggestion.summary}
              </p>
              {!currentPosted && donation.suggestion.evidence.length > 0 ? (
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
              {allocations.some((row) => row.invoiceId) ? (
                <p className="text-xs text-muted-foreground">
                  Project shares come from the invoice. Remove its match to
                  change the split.
                </p>
              ) : null}
              {allocations.map((row, index) => {
                const availableAmount = remainingDonationAllocationAmount(
                  donation.amount,
                  allocations,
                  row.key
                );
                const canUseRemaining =
                  remainingCents !== 0 &&
                  !wrongSign &&
                  !overallocated &&
                  !row.invoiceId &&
                  !row.mouPaymentId &&
                  !row.sharedMouGroupId &&
                  availableAmount !== "";
                return (
                  <div
                    key={row.key}
                    className="space-y-2 rounded-lg bg-muted/35 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <select
                        value={row.projectId}
                        onChange={(event) =>
                          changeProject(index, event.target.value)
                        }
                        disabled={pending || Boolean(row.invoiceId)}
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
                        aria-label={
                          row.invoiceId
                            ? `Remove invoice ${row.invoiceNumber} match`
                            : `Remove allocation ${index + 1}`
                        }
                        disabled={pending}
                        onClick={() =>
                          setAllocations((current) =>
                            current.filter((item, rowIndex) =>
                              row.invoiceId
                                ? item.invoiceId !== row.invoiceId
                                : rowIndex !== index
                            )
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="grid gap-1">
                      <div className="flex min-h-8 items-center justify-between gap-2">
                        <Label htmlFor={`allocation-${row.key}`} className="text-xs">
                          Amount ({donation.currency})
                        </Label>
                        {canUseRemaining ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            disabled={pending}
                            aria-label={`Use remaining amount (${money(availableAmount, donation.currency)}) for allocation ${index + 1}`}
                            onClick={() => changeAmount(index, availableAmount)}
                          >
                            Use remaining
                          </Button>
                        ) : null}
                      </div>
                      <Input
                        id={`allocation-${row.key}`}
                        type="number"
                        min={totalCents > 0 ? "0.01" : undefined}
                        max={totalCents < 0 ? "-0.01" : undefined}
                        step="0.01"
                        value={row.amount}
                        disabled={pending || Boolean(row.invoiceId)}
                        onChange={(event) =>
                          changeAmount(index, event.target.value)
                        }
                        className="tabular-nums"
                        placeholder="0.00"
                      />
                    </div>
                    {row.sponsorshipId ? (
                      <div className="grid gap-1">
                        <Label htmlFor={`net-${row.key}`} className="text-xs">
                          Available sponsorship funds ({donation.currency})
                        </Label>
                        <Input
                          id={`net-${row.key}`}
                          type="number"
                          min="0"
                          max={row.amount}
                          step="0.01"
                          value={row.actualNetAmount ?? row.amount}
                          disabled={pending}
                          onChange={(event) =>
                            setAllocations((current) =>
                              current.map((item, rowIndex) =>
                                rowIndex === index
                                  ? {
                                      ...item,
                                      actualNetAmount: event.target.value,
                                    }
                                  : item
                              )
                            )
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          After the saved organization donation fee. Check the
                          amount received. These funds stay separate from the
                          production budget.
                        </p>
                      </div>
                    ) : null}
                    {row.evidence.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {row.evidence.join(" ")}
                      </p>
                    ) : null}
                    {row.invoiceId ? (
                      <Link
                        href={`/api/invoices/${row.invoiceId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-9 items-center text-xs font-medium text-info hover:underline"
                      >
                        View invoice {row.invoiceNumber}
                      </Link>
                    ) : null}
                    {row.mouPaymentId &&
                    !row.sharedMouGroupId &&
                    !row.invoiceId &&
                    !donation.allocations.some(
                      (saved) => saved.mouPaymentId === row.mouPaymentId
                    ) ? (
                      <div className="flex flex-col gap-2 rounded-md border border-info/25 bg-info/5 px-2.5 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <p className="flex items-start gap-2">
                          <Link2 className="mt-0.5 size-3.5 shrink-0 text-info" />
                          <span>
                            Exact MoU payment match. Confirming this allocation
                            will mark that payment received.
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
                );
              })}
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
                <span className="text-muted-foreground">
                  Remaining unallocated
                </span>
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
              <div className="grid gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setAllocations(donation.allocations);
                    setReason("");
                    setEditing(false);
                  }}
                >
                  Cancel editing
                </Button>
                <Label htmlFor={`reason-${donation.id}`}>
                  Reason for change
                </Label>
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
                disabled={
                  pending || (currentPosted && reason.trim().length < 3)
                }
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
                  : currentPosted
                    ? "Save allocation changes"
                    : "Confirm allocation"}
              </Button>
            </div>
          </>
        )}
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
  const [separate, setSeparate] = useState(false);
  const match = donation.duplicateOf;
  return (
    <Card className="border-destructive/35 lg:sticky lg:top-20">
      <CardHeader className="space-y-3 border-b">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <h2 className="font-semibold">Possible duplicate</h2>
            <p className="text-sm text-muted-foreground">
              Same donor, amount, and date as a donation Sastra already has.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm">
          <DuplicateSide
            label="New row"
            donor={donation.donor}
            date={donation.donationDate}
            amount={money(donation.amount, donation.currency)}
            source={`${donation.sourceFilename} · row ${donation.sourceRowNumber}`}
            note={donation.notes}
          />
          <DuplicateSide
            label="Already in Sastra"
            donor={match?.donor ?? "Earlier donation"}
            date={match?.donationDate ?? donation.donationDate}
            amount={money(
              match?.amount ?? donation.amount,
              match?.currency ?? donation.currency
            )}
            source={
              match
                ? `${match.sourceFilename} · row ${match.sourceRowNumber} · ${statusLabel(match.reviewStatus)}`
                : null
            }
          />
        </dl>
        <div className="grid gap-2">
          <Button
            type="button"
            disabled={pending}
            onClick={() => onResolve("duplicate")}
          >
            {pendingAction === "duplicate" && !separate
              ? "Saving…"
              : "Confirm duplicate"}
          </Button>
          <p className="text-xs text-muted-foreground">
            The new row will not count as money received. You can undo this
            right after.
          </p>
        </div>
        {separate ? (
          <div className="grid gap-2 border-t pt-4">
            <Label htmlFor={`duplicate-reason-${donation.id}`}>
              Why is this a separate gift?
            </Label>
            <Textarea
              id={`duplicate-reason-${donation.id}`}
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Example: Two separate checks arrived on the same day."
              disabled={pending}
              autoFocus
            />
            <Button
              type="button"
              variant="outline"
              disabled={pending || reason.trim().length < 3}
              onClick={() => onResolve("distinct")}
            >
              {pendingAction === "duplicate" ? "Saving…" : "Keep as new gift"}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground"
            disabled={pending}
            onClick={() => setSeparate(true)}
          >
            It is a separate gift
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function DuplicateSide({
  label,
  donor,
  date,
  amount,
  source,
  note,
}: {
  label: string;
  donor: string;
  date: string;
  amount: string;
  source: string | null;
  note?: string | null;
}) {
  return (
    <div className="rounded-lg bg-muted/45 p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 space-y-0.5">
        <p className="font-medium">{donor}</p>
        <p className="tabular-nums text-muted-foreground">
          {date} · {amount}
        </p>
        {source ? (
          <p className="truncate text-xs text-muted-foreground" title={source}>
            {source}
          </p>
        ) : null}
        {note ? <p className="pt-1">{note}</p> : null}
      </dd>
    </div>
  );
}
