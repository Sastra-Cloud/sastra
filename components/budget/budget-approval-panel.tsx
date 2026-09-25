"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarClock,
  Check,
  ChevronDown,
  CircleDashed,
  History,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { createBudgetApprovalRequest } from "@/lib/budget/approval-actions";
import { ApprovalDecisionControls } from "@/components/budget/approval-decision-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Assignment = {
  id: string;
  approverId: string;
  approverName: string;
  taskId: string;
  decision: "pending" | "approved" | "changes_requested";
  changeNote: string | null;
  decidedAt: string | null;
};

type Round = {
  id: string;
  requesterName: string;
  dueDate: string;
  currency: string;
  totalAmount: string;
  status: "pending" | "approved" | "changes_requested" | "superseded";
  supersededFromStatus: "pending" | "approved" | "changes_requested" | null;
  approvedAt: string | null;
  supersededAt: string | null;
  createdAt: string;
  assignments: Assignment[];
};

function money(value: string, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function decisionLabel(decision: Assignment["decision"]) {
  if (decision === "approved") return "Approved";
  if (decision === "changes_requested") return "Changes requested";
  return "Waiting";
}

function DecisionIcon({ decision }: { decision: Assignment["decision"] }) {
  if (decision === "approved") return <Check className="size-4 text-success" />;
  if (decision === "changes_requested") {
    return <TriangleAlert className="size-4 text-warning" />;
  }
  return <CircleDashed className="size-4 text-muted-foreground" />;
}

export function BudgetApprovalPanel({
  projectId,
  printRunId,
  canManage,
  currentUserId,
  todayIso,
  defaultDueDate,
  eligibleApprovers,
  active,
  history,
  synchronizedAfterChange,
}: {
  projectId: string;
  printRunId?: string | null;
  canManage: boolean;
  currentUserId: string;
  todayIso: string;
  defaultDueDate: string;
  eligibleApprovers: {
    id: string;
    name: string;
    role: "super_admin" | "admin" | "manager";
  }[];
  active: Round | null;
  history: Round[];
  synchronizedAfterChange: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [showHistory, setShowHistory] = useState(false);

  function createRequest() {
    start(async () => {
      const result = await createBudgetApprovalRequest({
        projectId,
        printRunId: printRunId ?? null,
        approverIds: selected,
        dueDate,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Budget approval requested");
      setSelected([]);
      router.refresh();
    });
  }

  const currentAssignment = active?.assignments.find(
    (assignment) => assignment.approverId === currentUserId
  );
  const approvedCount =
    active?.assignments.filter((assignment) => assignment.decision === "approved")
      .length ?? 0;

  return (
    <Card id="budget-approval" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b bg-muted/20">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          Budget approval
        </CardTitle>
        <CardDescription>
          Optional internal sign-off for the current partner quotation. If you
          request approval, every selected approver must approve before the
          proposal can be sent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {synchronizedAfterChange ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <p>
              The quotation changed, so prior decisions are stale. The current
              approvers must review this version again.
            </p>
          </div>
        ) : null}

        {active ? (
          <>
            <div
              className={cn(
                "flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
                active.status === "approved" &&
                  "border-success/30 bg-success/5",
                active.status === "changes_requested" &&
                  "border-warning/30 bg-warning/5"
              )}
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {active.status === "approved"
                      ? "Approved for proposal"
                      : active.status === "changes_requested"
                        ? "Budget revision required"
                        : `Waiting for approval · ${approvedCount}/${active.assignments.length}`}
                  </p>
                  <Badge
                    variant={active.status === "approved" ? "default" : "secondary"}
                  >
                    {active.status.replace("_", " ")}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {money(active.totalAmount, active.currency)} · requested by{" "}
                  {active.requesterName}
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarClock className="size-4" />
                Due {new Date(`${active.dueDate}T00:00:00`).toLocaleDateString()}
              </div>
            </div>

            {currentAssignment ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="mb-1 text-sm font-semibold">Your decision</p>
                <p className="mb-3 text-sm text-muted-foreground">
                  Check every quotation line, the total, currency, partner, and
                  work description before responding.
                </p>
                <ApprovalDecisionControls
                  assignmentId={currentAssignment.id}
                  decision={currentAssignment.decision}
                  requestStatus={active.status}
                  canRespond
                />
              </div>
            ) : null}

            <ul className="divide-y rounded-lg border">
              {active.assignments.map((assignment) => (
                <li key={assignment.id} className="px-3 py-3">
                  <div className="flex items-start gap-2.5">
                    <DecisionIcon decision={assignment.decision} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">{assignment.approverName}</p>
                        <p className="text-xs text-muted-foreground">
                          {decisionLabel(assignment.decision)}
                          {assignment.decidedAt
                            ? ` · ${new Date(assignment.decidedAt).toLocaleString()}`
                            : ""}
                        </p>
                      </div>
                      {assignment.changeNote ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-warning-foreground">
                          {assignment.changeNote}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {active.status === "changes_requested" ? (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Revise any quotation-affecting field. Sastra will preserve this
                round in history and open a fresh round for the same approvers.
              </p>
            ) : null}
          </>
        ) : canManage ? (
          eligibleApprovers.length > 0 ? (
            <div className="space-y-4">
              <div>
                <p className="font-medium">Request budget approval</p>
                <p className="text-sm text-muted-foreground">
                  Choose any other workspace manager or admin. They do not need a
                  project role, and every person selected is required.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {eligibleApprovers.map((approver) => {
                  const checked = selected.includes(approver.id);
                  return (
                    <Label
                      key={approver.id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          setSelected((current) =>
                            value === true
                              ? [...current, approver.id]
                              : current.filter((id) => id !== approver.id)
                          )
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">{approver.name}</span>
                      <Badge variant="secondary">{approver.role}</Badge>
                    </Label>
                  );
                })}
              </div>
              <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="grid gap-1.5">
                  <Label htmlFor="budget-approval-due">Shared due date</Label>
                  <Input
                    id="budget-approval-due"
                    type="date"
                    min={todayIso}
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  disabled={pending || selected.length === 0 || !dueDate}
                  onClick={createRequest}
                >
                  <ShieldCheck className="size-4" />
                  Request approval
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              <p>
                There are no other active managers or admins to approve this
                budget. You cannot approve your own request.
              </p>
              <Link
                href="/settings/team"
                className="mt-2 inline-flex font-medium text-primary hover:underline"
              >
                Add or promote a teammate in Team settings
              </Link>
            </div>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            A manager has not requested budget approval yet.
          </p>
        )}

        {history.length > 0 ? (
          <div className="border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-0"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((value) => !value)}
            >
              <History className="size-4" />
              Approval history · {history.length}
              <ChevronDown
                className={cn("size-4 transition-transform", showHistory && "rotate-180")}
              />
            </Button>
            {showHistory ? (
              <ul className="mt-2 space-y-2">
                {history.map((round) => (
                  <li key={round.id} className="rounded-lg border px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {(round.supersededFromStatus ?? "superseded").replace("_", " ")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {money(round.totalAmount, round.currency)} ·{" "}
                        {new Date(round.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {round.assignments
                        .map(
                          (assignment) =>
                            `${assignment.approverName}: ${decisionLabel(assignment.decision)}`
                        )
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
