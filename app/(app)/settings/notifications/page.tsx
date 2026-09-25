import { requireUser } from "@/lib/auth/guards";
import { getEmailPreferences, listPushDevices } from "@/lib/notifications/queries";
import { NotificationPrefs } from "@/components/settings/notification-prefs";
import { PushSettings } from "@/components/settings/push-settings";
import { EmailTaskPreferences } from "@/components/settings/email-task-preferences";

export const metadata = { title: "Notification settings" };
export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const { user } = await requireUser();
  const [prefs, deviceRows] = await Promise.all([
    getEmailPreferences(user.id),
    listPushDevices(user.id),
  ]);
  const devices = deviceRows.map((d) => ({
    id: d.id,
    userAgent: d.userAgent,
    lastSeenAt: d.lastSeenAt.toISOString(),
  }));
  return (
    <div className="space-y-5">
      <NotificationPrefs
        workflowOptIn={prefs.workflowOptIn}
        standupOptIn={prefs.standupOptIn}
        emailDeliveryMode={prefs.emailDeliveryMode}
        emailDigestTimeMinutes={prefs.emailDigestTimeMinutes}
        timezone={user.timezone || "UTC"}
      />
      <EmailTaskPreferences
        suggestionsEnabled={prefs.emailTaskSuggestionsEnabled}
        learningEnabled={prefs.emailTaskLearningEnabled}
      />
      <PushSettings
        devices={devices}
        schedule={{
          mode: prefs.pushScheduleMode,
          quietHoursStart: prefs.quietHoursStart,
          quietHoursEnd: prefs.quietHoursEnd,
          workHoursStart: prefs.workHoursStart,
          workHoursEnd: prefs.workHoursEnd,
          pushOnlyWhenActive: prefs.pushOnlyWhenActive,
          pushReviewSuggestions: prefs.pushReviewSuggestions,
          pushPausedUntil: prefs.pushPausedUntil
            ? prefs.pushPausedUntil.toISOString()
            : null,
        }}
      />
    </div>
  );
}
