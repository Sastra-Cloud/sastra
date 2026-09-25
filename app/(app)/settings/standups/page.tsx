import Link from "next/link";

import { requireRole } from "@/lib/auth/guards";
import { listStandups } from "@/lib/standup/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StandupCreateForm } from "@/components/settings/standup-create-form";
import { getWorkspaceSettings } from "@/lib/workspace/queries";

export const metadata = { title: "Standups" };
export const dynamic = "force-dynamic";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function StandupsSettingsPage() {
  await requireRole("manager");
  const [list, workspace] = await Promise.all([listStandups(), getWorkspaceSettings()]);

  return (
    <div className="space-y-5">
      <StandupCreateForm defaultTimezone={workspace.timezone} />
      <div className="space-y-2">
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No standups yet.</p>
        ) : (
          list.map((s) => (
            <Link key={s.id} href={`/settings/standups/${s.id}`} className="block">
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">
                      {s.name}{" "}
                      {!s.isActive ? (
                        <Badge variant="secondary">Paused</Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.scheduleTime} {s.timezone} ·{" "}
                      {s.scheduleDays.map((d) => DAY_LABELS[d]).join(" ")} ·{" "}
                      {s.participantCount} participant
                      {s.participantCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">Edit →</span>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
