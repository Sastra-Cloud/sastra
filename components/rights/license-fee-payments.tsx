"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Check, FileText, RotateCcw, ScrollText } from "lucide-react";

import { markLicenseFeePaid, markLicenseFeeUnpaid } from "@/lib/rights/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePropState } from "@/hooks/use-prop-state";

type LicenseFeePaymentItem = {
  id: string;
  period: string;
  amount: string;
  currency: string;
  dueDate: string | null;
  assigneeName: string | null;
  taskId: string | null;
  paidAt: Date | string | null;
  receipts?: Array<{ id: string; fileId: string; fileName: string }>;
};

function money(amount: string, currency: string) {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

const periodLabel = (period: string) =>
  period === "initial" ? "Initial fee" : `Renewal · ${period}`;

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Read-only-with-mark-paid list of a project's license-fee payments (the initial
 * fee + any renewal fees). Shown inline on Rights and mirrored on Budget. Renders
 * nothing when there are no payments (config lives on the Rights page). The
 * optional `heading`/`sourceHref` frame it as a standalone Budget card.
 */
export function LicenseFeePayments({
  slug,
  canEdit,
  payments,
  heading = false,
  sourceHref,
}: {
  slug: string;
  canEdit: boolean;
  payments: LicenseFeePaymentItem[];
  heading?: boolean;
  sourceHref?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [visiblePayments, setVisiblePayments] = usePropState(payments);
  if (visiblePayments.length === 0) return null;

  const run = (payment: LicenseFeePaymentItem, paid: boolean, fn: () => Promise<unknown>, msg: string) => {
    const previous = visiblePayments;
    setVisiblePayments((current) =>
      current.map((item) =>
        item.id === payment.id ? { ...item, paidAt: paid ? new Date() : null } : item
      )
    );
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (error) {
        setVisiblePayments(previous);
        toast.error(error instanceof Error ? error.message : msg);
      }
    });
  };

  const list = (
    <ul className="divide-y">
      {visiblePayments.map((p) => {
        const paid = !!p.paidAt;
        const overdue = !paid && !!p.dueDate && p.dueDate < todayIso();
        return (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium tabular-nums">
                {periodLabel(p.period)} · {money(p.amount, p.currency)}
                {paid ? (
                  <Badge variant="secondary" className="ml-2">
                    Paid
                  </Badge>
                ) : overdue ? (
                  <Badge className="ml-2 bg-destructive text-destructive-foreground">
                    Overdue
                  </Badge>
                ) : (
                  <Badge className="ml-2 bg-warning text-warning-foreground">
                    Unpaid
                  </Badge>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {p.dueDate ? `Due ${p.dueDate}` : "No due date"}
                {p.assigneeName ? ` · ${p.assigneeName}` : ""}
              </p>
              {p.receipts?.map((receipt) => (
                <Link
                  key={receipt.id}
                  href={`/api/files/${receipt.fileId}/download`}
                  className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <FileText className="size-3.5" />
                  {receipt.fileName}
                </Link>
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {p.taskId ? (
                <Link
                  href={`/projects/${slug}/tasks`}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  View task
                </Link>
              ) : null}
              {canEdit ? (
                paid ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        p,
                        false,
                        () => markLicenseFeeUnpaid(p.id),
                        "Couldn't update the payment"
                      )
                    }
                  >
                    <RotateCcw className="size-3.5" />
                    Mark unpaid
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        p,
                        true,
                        () => markLicenseFeePaid(p.id),
                        "Couldn't update the payment"
                      )
                    }
                  >
                    <Check className="size-3.5" />
                    Mark paid
                  </Button>
                )
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );

  // Inline variant (inside the Rights license card): just the list.
  if (!heading) return list;

  // Standalone card variant (Budget page mirror).
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <ScrollText className="size-4 text-muted-foreground" />
            License fee
          </p>
          {sourceHref ? (
            <Link
              href={sourceHref}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Set up in Rights
            </Link>
          ) : null}
        </div>
        {list}
      </CardContent>
    </Card>
  );
}
