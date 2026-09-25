import { requireRole } from "@/lib/auth/guards";
import { listPortfolioSchedule } from "@/lib/schedule/queries";
import { getPlanningDefaults } from "@/lib/planning/queries";
import { getCapacityByPath } from "@/lib/capacity/queries";
import { ScheduleBoard } from "@/components/schedule/schedule-board";
import { TeamCapacityView } from "@/components/schedule/team-capacity-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  await requireRole("manager");
  const [rows, defaults, capacityByPath] = await Promise.all([
    listPortfolioSchedule(),
    getPlanningDefaults(),
    getCapacityByPath(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const staffingByPath = Object.fromEntries(
    capacityByPath.paths.map((p) => [
      p.group.key,
      { suggested: p.view.suggestedConcurrency, role: p.view.bottleneck?.label ?? null },
    ])
  );

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Schedule
        </h1>
        <p className="text-muted-foreground">
          Plan when each project runs and who staffs it — so due dates are
          realistic and no one is over- or under-worked.
        </p>
      </div>

      <Tabs defaultValue="roadmap">
        <TabsList>
          <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
          <TabsTrigger value="capacity">Team capacity</TabsTrigger>
        </TabsList>
        <TabsContent value="roadmap">
          <ScheduleBoard
            projects={rows}
            durationByKind={defaults.durationByKind}
            groups={defaults.groups}
            staffingByPath={staffingByPath}
            today={today}
          />
        </TabsContent>
        <TabsContent value="capacity">
          <TeamCapacityView data={capacityByPath} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
