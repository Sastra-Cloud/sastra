import Link from "next/link";
import {
  BookText,
  CalendarClock,
  CircleDollarSign,
  FileSignature,
  Flag,
  Printer,
} from "lucide-react";

import { dueLabel } from "@/lib/format";
import type { AgendaItem, AgendaKind } from "@/lib/agenda/bucket";
import { cn } from "@/lib/utils";

const KIND_META: Record<
  AgendaKind,
  { icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  task: { icon: CalendarClock, label: "Task" },
  milestone: { icon: Flag, label: "Milestone" },
  mou_payment: { icon: CircleDollarSign, label: "MoU payment" },
  royalty_payment: { icon: CircleDollarSign, label: "Royalty" },
  license_fee: { icon: CircleDollarSign, label: "License fee" },
  print_payment: { icon: Printer, label: "Print payment" },
  license_renewal: { icon: FileSignature, label: "License renewal" },
  mou_expiry: { icon: FileSignature, label: "MoU expiry" },
  rights_complete_by: { icon: FileSignature, label: "Rights deadline" },
  project_due: { icon: BookText, label: "Project due" },
};

function money(amount: string | null, currency: string | null): string | null {
  if (!amount) return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency || "USD"} ${n.toFixed(2)}`;
  }
}

export function AgendaRow({ item }: { item: AgendaItem }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const due = dueLabel(item.date);
  const amount = money(item.amount, item.currency);
  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {meta.label}
          {amount ? ` · ${amount}` : ""}
          {item.assigneeName ? ` · ${item.assigneeName}` : ""}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 text-xs font-medium tabular-nums",
          due.tone === "overdue" && "text-destructive",
          due.tone === "soon" && "text-warning-foreground",
          due.tone === "normal" && "text-muted-foreground"
        )}
      >
        {due.text}
      </span>
    </Link>
  );
}

/** Compact top-N list for dashboard/overview cards. */
export function CompactAgenda({
  items,
  limit = 5,
}: {
  items: AgendaItem[];
  limit?: number;
}) {
  const shown = items.slice(0, limit);
  if (shown.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-muted-foreground">Nothing coming due.</p>
    );
  }
  return (
    <ul className="divide-y">
      {shown.map((item) => (
        <li key={item.id}>
          <AgendaRow item={item} />
        </li>
      ))}
    </ul>
  );
}
