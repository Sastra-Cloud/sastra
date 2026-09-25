import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requireRole } from "@/lib/auth/guards";
import { getStandup } from "@/lib/standup/queries";
import { listAssignableUsers } from "@/lib/projects/queries";
import { StandupEditor } from "@/components/settings/standup-editor";

export const metadata = { title: "Edit standup" };
export const dynamic = "force-dynamic";

export default async function EditStandupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("manager");
  const { id } = await params;
  const [data, users] = await Promise.all([
    getStandup(id),
    listAssignableUsers(),
  ]);
  if (!data) notFound();

  return (
    <div className="space-y-4">
      <Link
        href="/settings/standups"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Standups
      </Link>
      <StandupEditor
        standup={{
          id: data.standup.id,
          name: data.standup.name,
          scheduleTime: data.standup.scheduleTime,
          scheduleDays: data.standup.scheduleDays,
          timezone: data.standup.timezone,
          reminderAfterMinutes: data.standup.reminderAfterMinutes,
          reportToUserId: data.standup.reportToUserId,
          isActive: data.standup.isActive,
        }}
        questions={data.questions.map((q) => ({ id: q.id, prompt: q.prompt }))}
        participants={data.participants}
        users={users.map((u) => ({ id: u.id, name: u.name }))}
      />
    </div>
  );
}
