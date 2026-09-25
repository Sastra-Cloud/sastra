"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  CalendarDays,
  Mail,
  Percent,
  Repeat,
  Save,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { updateProjectRoyalties } from "@/lib/budget/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const MONTHS = [
  ["1", "January"],
  ["2", "February"],
  ["3", "March"],
  ["4", "April"],
  ["5", "May"],
  ["6", "June"],
  ["7", "July"],
  ["8", "August"],
  ["9", "September"],
  ["10", "October"],
  ["11", "November"],
  ["12", "December"],
] as const;

type Person = { id: string; name: string; email: string | null };

export function RoyaltiesCard({
  projectId,
  canEdit,
  requiresRoyalties,
  royaltyPercentage,
  royaltyRecipientEmail,
  royaltyDueMonth,
  royaltyDueDay,
  royaltyTaskAssigneeId,
  royaltyFrequency,
  royaltyAmount,
  royaltyCurrency,
  projectCurrency,
  assignees,
}: {
  projectId: string;
  canEdit: boolean;
  requiresRoyalties: boolean;
  royaltyPercentage: string | null;
  royaltyRecipientEmail: string | null;
  royaltyDueMonth: number | null;
  royaltyDueDay: number | null;
  royaltyTaskAssigneeId: string | null;
  royaltyFrequency: string | null;
  royaltyAmount: string | null;
  royaltyCurrency: string | null;
  projectCurrency: string;
  assignees: Person[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [required, setRequired] = useState(requiresRoyalties);
  const [pct, setPct] = useState(royaltyPercentage ?? "");
  const [email, setEmail] = useState(royaltyRecipientEmail ?? "");
  const [dueMonth, setDueMonth] = useState(
    royaltyDueMonth ? String(royaltyDueMonth) : ""
  );
  const [dueDay, setDueDay] = useState(royaltyDueDay ? String(royaltyDueDay) : "");
  const [assigneeId, setAssigneeId] = useState(royaltyTaskAssigneeId ?? "");
  const [freq, setFreq] = useState(royaltyFrequency ?? "annual");
  const [amount, setAmount] = useState(royaltyAmount ?? "");
  const [currency, setCurrency] = useState(royaltyCurrency ?? projectCurrency);

  if (!canEdit && !requiresRoyalties) return null;

  function save() {
    start(async () => {
      const res = await updateProjectRoyalties(projectId, {
        requiresRoyalties: required,
        royaltyPercentage: pct === "" ? null : Number(pct),
        royaltyRecipientEmail: email || null,
        royaltyDueMonth: dueMonth === "" ? null : Number(dueMonth),
        royaltyDueDay: dueDay === "" ? null : Number(dueDay),
        royaltyTaskAssigneeId: assigneeId || null,
        royaltyFrequency: freq as "annual" | "quarterly" | "monthly",
        royaltyAmount: amount === "" ? null : Number(amount),
        royaltyCurrency: currency || null,
      });
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Royalty settings saved.");
      router.refresh();
    });
  }

  const displayedRequired = canEdit ? required : requiresRoyalties;
  const displayedAssigneeId = canEdit ? assigneeId : royaltyTaskAssigneeId;
  const displayedDueMonth = canEdit ? Number(dueMonth) || null : royaltyDueMonth;
  const displayedDueDay = canEdit ? Number(dueDay) || null : royaltyDueDay;
  const assignee = assignees.find((u) => u.id === displayedAssigneeId);
  const dueLabel =
    displayedDueMonth && displayedDueDay
      ? `${MONTHS.find(([v]) => Number(v) === displayedDueMonth)?.[1] ?? "Month"} ${displayedDueDay}`
      : null;

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Percent className="size-4 text-muted-foreground" />
          <h2 className="font-display text-base font-semibold">Royalties</h2>
          {displayedRequired ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Payable
            </span>
          ) : null}
        </div>

        {canEdit ? (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4"
                checked={required}
                disabled={pending}
                onChange={(e) => setRequired(e.target.checked)}
              />
              Royalties payable
            </label>

            {required ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="grid gap-1">
                  <Label className="flex items-center gap-1">
                    <Percent className="size-3.5" />
                    Rate
                  </Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={pct}
                      disabled={pending}
                      onChange={(e) => setPct(e.target.value)}
                      className="h-9"
                      placeholder="10"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label className="flex items-center gap-1">
                    <Repeat className="size-3.5" />
                    Frequency
                  </Label>
                  <select
                    className={selectClass}
                    value={freq}
                    disabled={pending}
                    onChange={(e) => setFreq(e.target.value)}
                  >
                    <option value="annual">Annually</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label className="flex items-center gap-1">
                    <Banknote className="size-3.5" />
                    Amount / period
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    disabled={pending}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-9 tabular-nums"
                    placeholder="500"
                  />
                </div>
                <div className="grid gap-1">
                  <Label>Currency</Label>
                  <Input
                    value={currency}
                    disabled={pending}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    className="h-9 uppercase"
                    maxLength={8}
                    placeholder="USD"
                  />
                </div>
                <div className="grid gap-1 lg:col-span-2">
                  <Label className="flex items-center gap-1">
                    <Mail className="size-3.5" />
                    Royalty recipient email
                  </Label>
                  <Input
                    type="email"
                    value={email}
                    disabled={pending}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-9"
                    placeholder="royalties@example.org"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="flex items-center gap-1">
                    <UserRound className="size-3.5" />
                    Task owner
                  </Label>
                  <select
                    className={selectClass}
                    value={assigneeId}
                    disabled={pending}
                    onChange={(e) => setAssigneeId(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {assignees.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label className="flex items-center gap-1">
                    <CalendarDays className="size-3.5" />
                    Due month
                  </Label>
                  <select
                    className={selectClass}
                    value={dueMonth}
                    disabled={pending}
                    onChange={(e) => setDueMonth(e.target.value)}
                  >
                    <option value="">Select</option>
                    {MONTHS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label>Due day</Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={dueDay}
                    disabled={pending}
                    onChange={(e) => setDueDay(e.target.value)}
                    className="h-9"
                    placeholder="31"
                  />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
                  <Button
                    type="button"
                    size="sm"
                    className="self-start"
                    onClick={save}
                    disabled={pending}
                  >
                    <Save className="size-4" />
                    Save royalty schedule
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    With an amount + owner set, each period auto-creates a royalty
                    payment and an assigned task. Leave the amount blank for a
                    reminder-only annual task.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <span>
              {requiresRoyalties
                ? `Payable${royaltyPercentage ? ` at ${royaltyPercentage}%` : ""}`
                : "None"}
            </span>
            {royaltyRecipientEmail ? <span>{royaltyRecipientEmail}</span> : null}
            {dueLabel ? <span>Due annually: {dueLabel}</span> : null}
            {assignee ? <span>Owner: {assignee.name}</span> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
