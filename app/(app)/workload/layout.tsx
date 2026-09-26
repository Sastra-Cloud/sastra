import { TeamPlanningNav } from "@/components/team-planning-nav";
import { requireRole } from "@/lib/auth/guards";
export default async function TeamPlanningLayout({ children }: { children: React.ReactNode }) {
  await requireRole("manager");
  return <div className="space-y-4"><TeamPlanningNav />{children}</div>;
}
