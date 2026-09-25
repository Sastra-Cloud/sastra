import { cn } from "@/lib/utils";
import {
  openLoadClass as openCls,
  overdueClass as overdueCls,
  utilizationClass as utilCls,
  utilizationPct as utilization,
} from "@/lib/capacity";
import { secondsToHours } from "@/lib/time";

export type CapacityPerson = {
  name: string;
  open: number;
  overdue: number;
  soon: number;
  weeklyHours?: number;
  estHours?: number;
  /** Actual tracked seconds over the last 7 days (optional; column hidden if all 0). */
  trackedSeconds?: number;
};

function Cell({ n, cls, label }: { n: number; cls: string; label: string }) {
  return (
    <span
      aria-label={label}
      className={cn(
        "inline-flex min-w-8 justify-center rounded px-2 py-0.5 tabular-nums",
        cls
      )}
    >
      {n}
    </span>
  );
}

/** Per-person open-task load with threshold colors. */
export function CapacityHeatmap({ people }: { people: CapacityPerson[] }) {
  if (people.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No open assigned tasks across the team.
      </p>
    );
  }
  const showUtil = people.some((p) => utilization(p) !== null);
  const showTracked = people.some((p) => (p.trackedSeconds ?? 0) > 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Open task load per person</caption>
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Person
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Open
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Overdue
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              This week
            </th>
            {showUtil ? (
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Utilization
              </th>
            ) : null}
            {showTracked ? (
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Tracked (7d)
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y">
          {people.map((p) => {
            const util = utilization(p);
            return (
              <tr key={p.name}>
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {p.name}
                </th>
                <td className="px-2 py-1.5 text-right">
                  <Cell n={p.open} cls={openCls(p.open)} label={`${p.open} open tasks`} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Cell
                    n={p.overdue}
                    cls={overdueCls(p.overdue)}
                    label={`${p.overdue} overdue`}
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Cell
                    n={p.soon}
                    cls={p.soon === 0 ? "text-muted-foreground" : ""}
                    label={`${p.soon} due this week`}
                  />
                </td>
                {showUtil ? (
                  <td className="px-2 py-1.5 text-right">
                    {util === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        aria-label={`${util}% utilized`}
                        className={cn(
                          "inline-flex min-w-12 justify-center rounded px-2 py-0.5 tabular-nums",
                          utilCls(util)
                        )}
                      >
                        {util}%
                      </span>
                    )}
                  </td>
                ) : null}
                {showTracked ? (
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {(p.trackedSeconds ?? 0) > 0
                      ? `${Math.round(secondsToHours(p.trackedSeconds ?? 0) * 10) / 10}h`
                      : "—"}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
