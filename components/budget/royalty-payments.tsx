"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Banknote, Check, RotateCcw } from "lucide-react";

import { markRoyaltyPaid, markRoyaltyUnpaid } from "@/lib/budget/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePropState } from "@/hooks/use-prop-state";

type RoyaltyPaymentItem = {
  id: string;
  period: string;
  amount: string;
  currency: string;
  dueDate: string | null;
  assigneeName: string | null;
  taskId: string | null;
  paidAt: Date | string | null;
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

export function RoyaltyPayments({
  slug,
  canEdit,
  payments,
}: {
  slug: string;
  canEdit: boolean;
  payments: RoyaltyPaymentItem[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [visiblePayments, setVisiblePayments] = usePropState(payments);
  if (visiblePayments.length === 0) return null;

  const run = (payment: RoyaltyPaymentItem, paid: boolean, fn: () => Promise<unknown>, msg: string) => {
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

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Banknote className="size-4 text-muted-foreground" />
          Royalty payments
        </p>
        <ul className="divide-y">
          {visiblePayments.map((p) => {
            const paid = !!p.paidAt;
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium tabular-nums">
                    {p.period} · {money(p.amount, p.currency)}
                    {paid ? (
                      <Badge variant="secondary" className="ml-2">
                        Paid
                      </Badge>
                    ) : (
                      <Badge className="ml-2 bg-warning text-warning-foreground">
                        Due
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.dueDate ? `Due ${p.dueDate}` : "No due date"}
                    {p.assigneeName ? ` · ${p.assigneeName}` : ""}
                  </p>
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
                            () => markRoyaltyUnpaid(p.id),
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
                            () => markRoyaltyPaid(p.id),
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
      </CardContent>
    </Card>
  );
}
