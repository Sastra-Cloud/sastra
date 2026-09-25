import { formatInTimeZone } from "date-fns-tz";

import type { AgendaKind } from "@/lib/agenda/bucket";

export type MyWorkView = "focus" | "board" | "agenda";
export type AgendaFilter = "all" | "tasks" | "deadlines" | "rights" | "finance";

export function normalizeMyWorkView(value: unknown): MyWorkView {
  return value === "board" || value === "agenda" ? value : "focus";
}

export function isCompletedOn(
  completedAt: Date | string | null,
  dateIso: string,
  timeZone: string
): boolean {
  return Boolean(
    completedAt &&
      formatInTimeZone(new Date(completedAt), timeZone, "yyyy-MM-dd") === dateIso
  );
}

export function matchesAgendaFilter(
  kind: AgendaKind,
  filter: AgendaFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "tasks") return kind === "task" || kind === "milestone";
  if (filter === "deadlines") return kind === "project_due";
  if (filter === "rights") {
    return (
      kind === "license_renewal" ||
      kind === "mou_expiry" ||
      kind === "rights_complete_by"
    );
  }
  return (
    kind === "mou_payment" ||
    kind === "royalty_payment" ||
    kind === "license_fee" ||
    kind === "print_payment"
  );
}
