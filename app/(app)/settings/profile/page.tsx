import { getEmailPreferences } from "@/lib/notifications/queries";
import { listEmailTaskRulesForUser } from "@/lib/email/task-rule-queries";
import { EmailTaskPreferences } from "@/components/settings/email-task-preferences";
import { EmailTaskLearningRules } from "@/components/tasks/email-task-learning-rules";
import { SectionDisclosure } from "@/components/section-disclosure";
import { requireUser } from "@/lib/auth/guards";
import { isAutoStartEnabled } from "@/lib/tasks/time-service";
import { ProfileForm } from "@/components/settings/profile-form";
import { AvatarUploader } from "@/components/settings/avatar-uploader";
import { AutoTimerToggle } from "@/components/settings/auto-timer-toggle";
import { GuidanceToggle } from "@/components/settings/guidance-toggle";

export const metadata = { title: "Profile settings" };
export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const { user } = await requireUser();
  const [autoStartTimer, prefs, rules] = await Promise.all([isAutoStartEnabled(user.id), getEmailPreferences(user.id), listEmailTaskRulesForUser(user.id)]);
  const guidanceEnabled =
    (user as { guidanceLevel?: string }).guidanceLevel !== "off";
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium">Profile photo</p>
        <AvatarUploader name={user.name} image={user.image ?? null} />
      </div>
      <ProfileForm
        defaultName={user.name}
        defaultTimezone={user.timezone ?? "UTC"}
      />
      <div className="space-y-3 border-t pt-6">
        <p className="text-sm font-medium">Guidance</p>
        <GuidanceToggle defaultEnabled={guidanceEnabled} />
      </div>
      <SectionDisclosure id="email-assistant" title="Email assistant preferences" description="Task suggestions, learning, and approved personal rules">
        <EmailTaskPreferences suggestionsEnabled={prefs.emailTaskSuggestionsEnabled} learningEnabled={prefs.emailTaskLearningEnabled} />
        <EmailTaskLearningRules rules={rules.filter(rule => rule.status === "approved")} />
      </SectionDisclosure>
      <div className="space-y-3 border-t pt-6">
        <p className="text-sm font-medium">Time tracking</p>
        <AutoTimerToggle defaultEnabled={autoStartTimer} />
      </div>
    </div>
  );
}
